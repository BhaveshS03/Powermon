import St from 'gi://St';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { CpuPowerReader } from './cpuPowerReader.js';

export default class PowermonExtension extends Extension {

  constructor(metadata) {
    super(metadata);

    this._panelButton = null;
    this._panelButtonText = null;
    this._timeout = null;
    this._reader = null;
  }

  enable() {
    this._panelButton = new St.Bin({
      style_class: 'panel-button',
    });
    this._panelButtonText = new St.Label({
      style_class: 'examplePanelText',
      text: 'Starting..',
    });
    this._panelButton.set_child(this._panelButtonText);

    this._reader = new CpuPowerReader();
    Main.panel._rightBox.insert_child_at_index(this._panelButton, 1);

    this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
      const watts = this._reader.getPowerInWatts();
      if (watts !== null) {
        this._panelButtonText.set_text(`CPU: ${watts.toFixed(1)} W`);
      } else {
        this._panelButtonText.set_text('CPU: N/A');
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    if (this._timeout) {
      GLib.source_remove(this._timeout);
      this._timeout = null;
    }
    this._reader = null;
    Main.panel._rightBox.remove_child(this._panelButton);
    this._panelButton.destroy();
    this._panelButton = null;
    this._panelButtonText = null;
  }
}
