// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Mode
} from '@jupyterlab/codemirror';

import {
  Contents
} from '@jupyterlab/services';

import {
  JSONObject, JSONValue, PromiseDelegate
} from '@phosphor/coreutils';

import {
  Message, MessageLoop
} from '@phosphor/messaging';

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  BoxLayout, Widget
} from '@phosphor/widgets';

import {
  CodeEditor
} from '@jupyterlab/codeeditor';

import {
  ActivityMonitor, IChangedArgs, PathExt
} from '@jupyterlab/coreutils';

import {
  IModelDB
} from '@jupyterlab/observables';

import {
  IRenderMime, RenderMime, MimeModel
} from '@jupyterlab/rendermime';

import {
  DocumentRegistry
} from './index';


/**
 * The default implementation of a document model.
 */
export
class DocumentModel extends CodeEditor.Model implements DocumentRegistry.ICodeModel  {
  /**
   * Construct a new document model.
   */
  constructor(languagePreference?: string, modelDB?: IModelDB) {
    super({modelDB});
    this._defaultLang = languagePreference || '';
    this.value.changed.connect(this.triggerContentChange, this);
  }

  /**
   * A signal emitted when the document content changes.
   */
  get contentChanged(): ISignal<this, void> {
    return this._contentChanged;
  }

  /**
   * A signal emitted when the document state changes.
   */
  get stateChanged(): ISignal<this, IChangedArgs<any>> {
    return this._stateChanged;
  }

  /**
   * The dirty state of the document.
   */
  get dirty(): boolean {
    return this._dirty;
  }
  set dirty(newValue: boolean) {
    if (newValue === this._dirty) {
      return;
    }
    let oldValue = this._dirty;
    this._dirty = newValue;
    this.triggerStateChange({ name: 'dirty', oldValue, newValue });
  }

  /**
   * The read only state of the document.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(newValue: boolean) {
    if (newValue === this._readOnly) {
      return;
    }
    let oldValue = this._readOnly;
    this._readOnly = newValue;
    this.triggerStateChange({ name: 'readOnly', oldValue, newValue });
  }

  /**
   * The default kernel name of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelName(): string {
    return '';
  }

  /**
   * The default kernel language of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelLanguage(): string {
    return this._defaultLang;
  }

  /**
   * Serialize the model to a string.
   */
  toString(): string {
    return this.value.text;
  }

  /**
   * Deserialize the model from a string.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromString(value: string): void {
    this.value.text = value;
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): JSONValue {
    return JSON.parse(this.value.text || 'null');
  }

  /**
   * Deserialize the model from JSON.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromJSON(value: JSONValue): void {
    this.fromString(JSON.stringify(value));
  }

  /**
   * Trigger a state change signal.
   */
  protected triggerStateChange(args: IChangedArgs<any>): void {
    this._stateChanged.emit(args);
  }

  /**
   * Trigger a content changed signal.
   */
  protected triggerContentChange(): void {
    this._contentChanged.emit(void 0);
    this.dirty = true;
  }

  private _defaultLang = '';
  private _dirty = false;
  private _readOnly = false;
  private _contentChanged = new Signal<this, void>(this);
  private _stateChanged = new Signal<this, IChangedArgs<any>>(this);
}


/**
 * An implementation of a model factory for text files.
 */
export
class TextModelFactory implements DocumentRegistry.CodeModelFactory {
  /**
   * The name of the model type.
   *
   * #### Notes
   * This is a read-only property.
   */
  get name(): string {
    return 'text';
  }

  /**
   * The type of the file.
   *
   * #### Notes
   * This is a read-only property.
   */
  get contentType(): Contents.ContentType {
    return 'file';
  }

  /**
   * The format of the file.
   *
   * This is a read-only property.
   */
  get fileFormat(): Contents.FileFormat {
    return 'text';
  }

  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the model factory.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Create a new model.
   *
   * @param languagePreference - An optional kernel language preference.
   *
   * @returns A new document model.
   */
  createNew(languagePreference?: string, modelDB?: IModelDB): DocumentRegistry.ICodeModel {
    return new DocumentModel(languagePreference, modelDB);
  }

  /**
   * Get the preferred kernel language given a file path.
   */
  preferredLanguage(path: string): string {
    let mode = Mode.findByFileName(path);
    return mode && mode.mode;
  }

  private _isDisposed = false;
}


/**
 * An implementation of a model factory for base64 files.
 */
export
class Base64ModelFactory extends TextModelFactory {
  /**
   * The name of the model type.
   *
   * #### Notes
   * This is a read-only property.
   */
  get name(): string {
    return 'base64';
  }

  /**
   * The type of the file.
   *
   * #### Notes
   * This is a read-only property.
   */
  get contentType(): Contents.ContentType {
    return 'file';
  }

  /**
   * The format of the file.
   *
   * This is a read-only property.
   */
  get fileFormat(): Contents.FileFormat {
    return 'base64';
  }
}


/**
 * The default implemetation of a widget factory.
 */
export
abstract class ABCWidgetFactory<T extends DocumentRegistry.IReadyWidget, U extends DocumentRegistry.IModel> implements DocumentRegistry.IWidgetFactory<T, U> {
  /**
   * Construct a new `ABCWidgetFactory`.
   */
  constructor(options: DocumentRegistry.IWidgetFactoryOptions) {
    this._name = options.name;
    this._readOnly = options.readOnly === undefined ? false : options.readOnly;
    this._defaultFor = options.defaultFor ? options.defaultFor.slice() : [];
    this._fileTypes = options.fileTypes.slice();
    this._modelName = options.modelName || 'text';
    this._preferKernel = !!options.preferKernel;
    this._canStartKernel = !!options.canStartKernel;
  }

  /**
   * A signal emitted when a widget is created.
   */
  get widgetCreated(): ISignal<DocumentRegistry.IWidgetFactory<T, U>, T> {
    return this._widgetCreated;
  }

  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the document manager.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Whether the widget factory is read only.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }

  /**
   * The name of the widget to display in dialogs.
   */
  get name(): string {
    return this._name;
  }

  /**
   * The file types the widget can view.
   */
  get fileTypes(): string[] {
    return this._fileTypes.slice();
  }

  /**
   * The registered name of the model type used to create the widgets.
   */
  get modelName(): string {
    return this._modelName;
  }

  /**
   * The file types for which the factory should be the default.
   */
  get defaultFor(): string[] {
    return this._defaultFor.slice();
  }

  /**
   * Whether the widgets prefer having a kernel started.
   */
  get preferKernel(): boolean {
    return this._preferKernel;
  }

  /**
   * Whether the widgets can start a kernel when opened.
   */
  get canStartKernel(): boolean {
    return this._canStartKernel;
  }

  /**
   * Create a new widget given a document model and a context.
   *
   * #### Notes
   * It should emit the [widgetCreated] signal with the new widget.
   */
  createNew(context: DocumentRegistry.IContext<U>): T {
    let widget = this.createNewWidget(context);
    this._widgetCreated.emit(widget);
    return widget;
  }

  /**
   * Create a widget for a context.
   */
  protected abstract createNewWidget(context: DocumentRegistry.IContext<U>): T;

  private _isDisposed = false;
  private _name: string;
  private _readOnly: boolean;
  private _canStartKernel: boolean;
  private _preferKernel: boolean;
  private _modelName: string;
  private _fileTypes: string[];
  private _defaultFor: string[];
  private _widgetCreated = new Signal<DocumentRegistry.IWidgetFactory<T, U>, T>(this);
}



/**
 * A widget for rendered mimetype document.
 */
export
class MimeDocument extends Widget implements DocumentRegistry.IReadyWidget {
  /**
   * Construct a new markdown widget.
   */
  constructor(options: MimeDocument.IOptions) {
    super();
    this.addClass('jp-MimeDocument');
    this.node.tabIndex = -1;
    let layout = this.layout = new BoxLayout();
    let toolbar = new Widget();
    toolbar.addClass('jp-Toolbar');
    layout.addWidget(toolbar);
    BoxLayout.setStretch(toolbar, 0);
    let context = options.context;
    this.title.label = PathExt.basename(context.path);
    this.rendermime = options.rendermime.clone({ resolver: context });

    this._context = context;
    this._mimeType = options.mimeType;
    this._dataType = options.dataType || 'string';

    this._renderer = this.rendermime.createRenderer(this._mimeType);
    layout.addWidget(this._renderer);
    BoxLayout.setStretch(this._renderer, 1);

    context.pathChanged.connect(this._onPathChanged, this);

    this._context.ready.then(() => {
      if (this.isDisposed) {
        return;
      }
      return this._render().then();
    }).then(() => {
      // Throttle the rendering rate of the widget.
      this._monitor = new ActivityMonitor({
        signal: context.model.contentChanged,
        timeout: options.renderTimeout
      });
      this._monitor.activityStopped.connect(this.update, this);

      this._ready.resolve(undefined);
    });
  }

  /**
   * The markdown widget's context.
   */
  get context(): DocumentRegistry.Context {
    return this._context;
  }

  /**
   * The rendermime instance associated with the widget.
   */
  readonly rendermime: RenderMime;

  /**
   * A promise that resolves when the widget is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    if (this._monitor) {
      this._monitor.dispose();
    }
    this._monitor = null;
    super.dispose();
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    if (!this._hasRendered) {
      this.node.focus();
      return;
    }
    MessageLoop.sendMessage(this._renderer, Widget.Msg.ActivateRequest);
    if (!this.node.contains(document.activeElement)) {
      this.node.focus();
    }
  }

  /**
   * Handle an `update-request` message to the widget.
   */
  protected onUpdateRequest(msg: Message): void {
    if (this._context.isReady) {
      this._render();
    }
  }

  /**
   * Render the mime content.
   */
  private _render(): Promise<void> {
    let context = this._context;
    let model = context.model;
    let data: JSONObject = {};
    if (this._dataType === 'string') {
      data[this._mimeType] = model.toString();
    } else {
      data[this._mimeType] = model.toJSON();
    }
    let mimeModel = new MimeModel({ data });
    return this._renderer.renderModel(mimeModel).then(() => {
      // Handle the first render after an activation.
      if (!this._hasRendered && this.node === document.activeElement) {
        MessageLoop.sendMessage(this._renderer, Widget.Msg.ActivateRequest);
      }
      this._hasRendered = true;
    });
  }

  /**
   * Handle a path change.
   */
  private _onPathChanged(): void {
    this.title.label = PathExt.basename(this._context.path);
  }

  private _context: DocumentRegistry.Context;
  private _monitor: ActivityMonitor<any, any> | null;
  private _renderer: IRenderMime.IRenderer;
  private _mimeType: string;
  private _ready = new PromiseDelegate<void>();
  private _dataType: 'string' | 'json';
  private _hasRendered = false;
}


/**
 * The namespace for MimeDocument class statics.
 */
export
namespace MimeDocument {
  /**
   * The options used to initialize a MimeDocument.
   */
  export
  interface IOptions {
    /**
     * The document context.
     */
    context: DocumentRegistry.Context;

    /**
     * The rendermime instance.
     */
    rendermime: RenderMime;

    /**
     * The mime type.
     */
    mimeType: string;

    /**
     * The render timeout.
     */
    renderTimeout: number;

    /**
     * Preferred data type from the model.
     */
    dataType?: 'string' | 'json';
  }
}


/**
 * An implementation of a widget factory for a rendered mimetype document.
 */
export
class MimeDocumentFactory extends ABCWidgetFactory<MimeDocument, DocumentRegistry.IModel> {
  /**
   * Construct a new markdown widget factory.
   */
  constructor(options: MimeDocumentFactory.IOptions) {
    super(Private.createRegistryOptions(options));
    this._rendermime = options.rendermime;
    this._renderTimeout = options.renderTimeout || 1000;
    this._dataType = options.dataType || 'string';
    this._fileType = options.primaryFileType;
  }

  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(context: DocumentRegistry.Context): MimeDocument {
    let ft = this._fileType;
    let mimeType = ft.mimeTypes.length ? ft.mimeTypes[0] : 'text/plain';
    let widget = new MimeDocument({
      context,
      mimeType,
      rendermime: this._rendermime.clone(),
      renderTimeout: this._renderTimeout,
      dataType: this._dataType,
    });

    widget.title.iconClass = ft.iconClass;
    widget.title.iconLabel = ft.iconLabel;
    return widget;
  }

  private _rendermime: RenderMime;
  private _renderTimeout: number;
  private _dataType: 'string' | 'json';
  private _fileType: DocumentRegistry.IFileType;
}


/**
 * The namespace for MimeDocumentFactory class statics.
 */
export
namespace MimeDocumentFactory {
  /**
   * The options used to initialize a MimeDocumentFactory.
   */
  export
  interface IOptions extends DocumentRegistry.IWidgetFactoryOptions {
    /**
     * The primary file type associated with the document.
     */
    primaryFileType: DocumentRegistry.IFileType;

    /**
     * The rendermime instance.
     */
    rendermime: RenderMime;

    /**
     * The render timeout.
     */
    renderTimeout?: number;

    /**
     * Preferred data type from the model.
     */
    dataType?: 'string' | 'json';
  }
}


/**
 * The namespace for the module implementation details.
 */
namespace Private {
  /**
   * Create the document registry options.
   */
  export
  function createRegistryOptions(options: MimeDocumentFactory.IOptions): DocumentRegistry.IWidgetFactoryOptions {
    return { ...options, readOnly: true } as DocumentRegistry.IWidgetFactoryOptions;
  }
}
