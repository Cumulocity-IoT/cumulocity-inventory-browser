import { Component, effect, inject } from '@angular/core';
import { EditorComponent } from '@c8y/ngx-components/editor';
import type * as Monaco from 'monaco-editor';
import { JsonLink, serializeWithLinks } from './json-serializer.util';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

const LINK_DECORATION_CLASS = 'json-ref-link-decoration';
const HOVER_CLASS = 'json-ref-link-hover';

@Component({
  selector: 'app-managed-object-view',
  standalone: true,
  imports: [EditorComponent],
  templateUrl: './managed-object-view.component.html',
  styleUrl: './managed-object-view.component.scss',
})
export class ManagedObjectViewComponent {
  protected readonly nav = inject(InventoryNavigationService);

  protected readonly editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    language: 'json',
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
  };

  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private links: JsonLink[] = [];
  private decorationIds: string[] = [];

  constructor() {
    effect(() => {
      const obj = this.nav.currentObject();
      this.render(obj);
    });
  }

  onEditorInit(editor: Monaco.editor.IStandaloneCodeEditor): void {
    this.editor = editor;
    editor.onMouseDown((event) => this.handleMouseDown(event));
    editor.onMouseMove((event) => this.handleMouseMove(event));
    editor.onMouseLeave(() => editor.getDomNode()?.classList.remove(HOVER_CLASS));
    this.render(this.nav.currentObject());
  }

  private render(obj: unknown): void {
    if (!this.editor) {
      return;
    }
    if (!obj) {
      this.links = [];
      this.editor.setValue('');
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
      return;
    }
    const { text, links } = serializeWithLinks(obj);
    this.links = links;
    this.editor.setValue(text);
    this.updateDecorations();
  }

  private updateDecorations(): void {
    if (!this.editor) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    const decorations: Monaco.editor.IModelDeltaDecoration[] = this.links.map((link) => {
      const start = model.getPositionAt(link.start);
      const end = model.getPositionAt(link.end);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        options: { inlineClassName: LINK_DECORATION_CLASS },
      };
    });
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
  }

  private handleMouseDown(event: Monaco.editor.IEditorMouseEvent): void {
    const link = this.linkAt(event);
    if (!link) {
      return;
    }
    const originId = this.nav.currentObject()?.id;
    const siblingContext =
      link.siblingArray && link.siblingIndex !== undefined && originId
        ? { referenceArray: link.siblingArray, index: link.siblingIndex, originId }
        : undefined;
    void this.nav.open(link.node.id, siblingContext);
  }

  private handleMouseMove(event: Monaco.editor.IEditorMouseEvent): void {
    const hovering = !!this.linkAt(event);
    this.editor?.getDomNode()?.classList.toggle(HOVER_CLASS, hovering);
  }

  private linkAt(event: Monaco.editor.IEditorMouseEvent): JsonLink | undefined {
    const position = event.target.position;
    const model = this.editor?.getModel();
    if (!position || !model) {
      return undefined;
    }
    const offset = model.getOffsetAt(position);
    return this.links.find((link) => offset >= link.start && offset < link.end);
  }
}
