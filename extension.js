import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

let utf8decoder = new TextDecoder();
let panelButton, panelButtonText,timeout;  


function bashSyncCommand( command )
{

	var [ok,out,error,exit] = GLib.spawn_command_line_sync( `bash -c "${command}"` );
  let watts = utf8decoder.decode(out);
  panelButtonText.set_text("CPU: "+watts.toString().slice(0,4)+" W");

}

export default class ExampleExtension extends Extension {

  constructor(metadata) {
    super(metadata)
    console.debug(`constructing ${this.metadata.name}`);
    
     panelButton = new St.Bin({
      style_class: 'panel-button'
     });
     panelButtonText = new St.Label({
      style_class : 'examplePanelText',
      text : 'Starting..'
     });
     panelButton.set_child(panelButtonText);
    }

    enable() {
      Main.panel._rightBox.insert_child_at_index(panelButton,1);

      timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2.0,   () => {  
        bashSyncCommand('./zenmonitor-cli');
        return GLib.SOURCE_CONTINUE;;
        }
      );
    }

    disable() {
      console.debug(`disabling ${this.metadata.name}`);
      GLib.source_remove(timeout);  
      Main.panel._rightBox.remove_child(panelButton);
    }
}

