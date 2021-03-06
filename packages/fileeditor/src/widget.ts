// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BoxLayout, Widget
} from '@phosphor/widgets';

import {
  IChangedArgs, PathExt
} from '@jupyterlab/coreutils';

import {
  ABCWidgetFactory, DocumentRegistry
} from '@jupyterlab/docregistry';

import {
  CodeEditor, IEditorServices, IEditorMimeTypeService, CodeEditorWrapper
} from '@jupyterlab/codeeditor';

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  Message
} from '@phosphor/messaging';

/**
 * The data attribute added to a widget that can run code.
 */
const CODE_RUNNER = 'jpCodeRunner';

/**
 * The data attribute added to a widget that can undo.
 */
const UNDOER = 'jpUndoer';

/**
 * The class name added to a dirty widget.
 */
const DIRTY_CLASS = 'jp-mod-dirty';

/**
 * The class name added to a jupyter editor widget.
 */
const EDITOR_CLASS = 'jp-FileEditor';


/**
 * A code editor wrapper for the file editor.
 */
export
class FileEditorCodeWrapper extends CodeEditorWrapper {
  /**
   * Construct a new editor widget.
   */
  constructor(options: FileEditor.IOptions) {
    super({
      factory: options.factory,
      model: options.context.model
    });

    const context = this._context = options.context;
    const editor = this.editor;

    this.addClass(EDITOR_CLASS);
    this.node.dataset[CODE_RUNNER] = 'true';
    this.node.dataset[UNDOER] = 'true';

    editor.model.value.text = context.model.toString();
    context.ready.then(() => { this._onContextReady(); });

    if (context.model.modelDB.isCollaborative) {
      let modelDB = context.model.modelDB;
      modelDB.connected.then(() => {
        let collaborators = modelDB.collaborators;
        if (!collaborators) {
          return;
        }

        // Setup the selection style for collaborators
        let localCollaborator = collaborators.localCollaborator;
        this.editor.uuid = localCollaborator.sessionId;

        this.editor.selectionStyle = {
          ...CodeEditor.defaultSelectionStyle,
          color: localCollaborator.color
        };

        collaborators.changed.connect(this._onCollaboratorsChanged, this);
        // Trigger an initial onCollaboratorsChanged event.
        this._onCollaboratorsChanged();
      });
    }
  }

  /**
   * Get the context for the editor widget.
   */
  get context(): DocumentRegistry.Context {
    return this._context;
  }

  /**
   * A promise that resolves when the file editor is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Handle actions that should be taken when the context is ready.
   */
  private _onContextReady(): void {
    if (this.isDisposed) {
      return;
    }
    const contextModel = this._context.model;
    const editor = this.editor;
    const editorModel = editor.model;

    // Set the editor model value.
    editorModel.value.text = contextModel.toString();

    // Prevent the initial loading from disk from being in the editor history.
    editor.clearHistory();
    this._handleDirtyState();

    // Wire signal connections.
    contextModel.stateChanged.connect(this._onModelStateChanged, this);
    contextModel.contentChanged.connect(this._onContentChanged, this);

    // Resolve the ready promise.
    this._ready.resolve(undefined);
  }

  /**
   * Handle a change to the context model state.
   */
  private _onModelStateChanged(sender: DocumentRegistry.IModel, args: IChangedArgs<any>): void {
    if (args.name === 'dirty') {
      this._handleDirtyState();
    }
  }

  /**
   * Handle the dirty state of the context model.
   */
  private _handleDirtyState(): void {
    if (this._context.model.dirty) {
      this.title.className += ` ${DIRTY_CLASS}`;
    } else {
      this.title.className = this.title.className.replace(DIRTY_CLASS, '');
    }
  }

  /**
   * Handle a change in context model content.
   */
  private _onContentChanged(): void {
    const editorModel = this.editor.model;
    const oldValue = editorModel.value.text;
    const newValue = this._context.model.toString();

    if (oldValue !== newValue) {
      editorModel.value.text = newValue;
    }
  }

  /**
   * Handle a change to the collaborators on the model
   * by updating UI elements associated with them.
   */
  private _onCollaboratorsChanged(): void {
    // If there are selections corresponding to non-collaborators,
    // they are stale and should be removed.
    let collaborators = this._context.model.modelDB.collaborators;
    if (!collaborators) {
      return;
    }
    for (let key of this.editor.model.selections.keys()) {
      if (!collaborators.has(key)) {
        this.editor.model.selections.delete(key);
      }
    }
  }

  protected _context: DocumentRegistry.Context;
  private _ready = new PromiseDelegate<void>();
}


/**
 * A document widget for editors.
 */
export
class FileEditor extends Widget implements DocumentRegistry.IReadyWidget {
  /**
   * Construct a new editor widget.
   */
  constructor(options: FileEditor.IOptions) {
    super();

    const context = this._context = options.context;
    this._mimeTypeService = options.mimeTypeService;

    let editorWidget = this.editorWidget = new FileEditorCodeWrapper(options);
    this.editor = editorWidget.editor;
    this.model = editorWidget.model;

    context.pathChanged.connect(this._onPathChanged, this);
    this._onPathChanged();


    let layout = this.layout = new BoxLayout();
    let toolbar = new Widget();
    toolbar.addClass('jp-Toolbar');

    layout.addWidget(toolbar);
    BoxLayout.setStretch(toolbar, 0);
    layout.addWidget(editorWidget);
    BoxLayout.setStretch(editorWidget, 1);
  }

  /**
   * Get the context for the editor widget.
   */
  get context(): DocumentRegistry.Context {
    return this.editorWidget.context;
  }

  /**
   * A promise that resolves when the file editor is ready.
   */
  get ready(): Promise<void> {
    return this.editorWidget.ready;
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the widget's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    if (!this.model) {
      return;
    }
    switch (event.type) {
    case 'mousedown':
      this._ensureFocus();
      break;
    default:
      break;
    }
  }

  /**
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    let node = this.node;
    node.addEventListener('mousedown', this);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    let node = this.node;
    node.removeEventListener('mousedown', this);
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    this._ensureFocus();
  }

  /**
   * Ensure that the widget has focus.
   */
  private _ensureFocus(): void {
    if (!this.editor.hasFocus()) {
      this.editor.focus();
    }
  }

  /**
   * Handle a change to the path.
   */
  private _onPathChanged(): void {
    const editor = this.editor;
    const path = this._context.path;

    editor.model.mimeType = this._mimeTypeService.getMimeTypeByFilePath(path);
    this.title.label = PathExt.basename(path.split(':').pop()!);
  }

  private editorWidget: FileEditorCodeWrapper;
  public model: CodeEditor.IModel;
  public editor: CodeEditor.IEditor;
  protected _context: DocumentRegistry.Context;
  private _mimeTypeService: IEditorMimeTypeService;
}


/**
 * The namespace for editor widget statics.
 */
export
namespace FileEditor {
  /**
   * The options used to create an editor widget.
   */
  export
  interface IOptions {
    /**
     * A code editor factory.
     */
    factory: CodeEditor.Factory;

    /**
     * The mime type service for the editor.
     */
    mimeTypeService: IEditorMimeTypeService;

    /**
     * The document context associated with the editor.
     */
    context: DocumentRegistry.CodeContext;
  }
}


/**
 * A widget factory for editors.
 */
export
class FileEditorFactory extends ABCWidgetFactory<FileEditor, DocumentRegistry.ICodeModel> {
  /**
   * Construct a new editor widget factory.
   */
  constructor(options: FileEditorFactory.IOptions) {
    super(options.factoryOptions);
    this._services = options.editorServices;
  }

  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(context: DocumentRegistry.CodeContext): FileEditor {
    let func = this._services.factoryService.newDocumentEditor.bind(
      this._services.factoryService);
    let factory: CodeEditor.Factory = options => {
      return func(options);
    };
    return new FileEditor({
      factory,
      context,
      mimeTypeService: this._services.mimeTypeService
    });
  }

  private _services: IEditorServices;
}


/**
 * The namespace for `FileEditorFactory` class statics.
 */
export
namespace FileEditorFactory {
  /**
   * The options used to create an editor widget factory.
   */
  export
  interface IOptions {
    /**
     * The editor services used by the factory.
     */
    editorServices: IEditorServices;

    /**
     * The factory options associated with the factory.
     */
    factoryOptions: DocumentRegistry.IWidgetFactoryOptions;
  }
}
