// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  IThemeManager
} from '@jupyterlab/apputils';


/**
 * A plugin for the Jupyter Light Theme.
 */
const plugin: JupyterLabPlugin<void> = {
  id: 'jupyter.themes.light',
  requires: [IThemeManager],
  activate: function(app: JupyterLab, manager: IThemeManager) {
    manager.register({
      name: 'JupyterLab Light',
      load: function() {
        // Load the optional monospace font for the input/output prompt.
        manager.loadCSS('https://fonts.googleapis.com/css?family=Roboto+Mono');
        return manager.loadCSS('@jupyterlab/theme-light-extension/index.css');
      },
      unload: function() {
        return Promise.resolve(void 0);
      }
    });
  },
  autoStart: true
};


export default plugin;
