import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class CpuPowerReader {
    constructor() {
        this.paths = {};
        this.method = null;

        // For energy-based calculations (Joules over time)
        this.lastEnergy = 0;
        this.lastTime = 0;

        this._initPowerData();
    }

    // --- Utility Methods ---

    _readFile(path) {
        try {
            const file = Gio.File.new_for_path(path);
            const [, contents] = file.load_contents(null);
            return new TextDecoder().decode(contents).trim();
        } catch (e) {
            return null;
        }
    }

    _readNumber(path) {
        const val = this._readFile(path);
        return val ? parseInt(val, 10) : null;
    }

    // Scans hwmon to match a label (e.g., power1_label == "Pcore")
    _findInputPath(basePath, type, targetLabel) {
        for (let i = 1; i <= 10; i++) {
            const labelPath = `${basePath}/${type}${i}_label`;
            if (this._readFile(labelPath) === targetLabel) {
                return `${basePath}/${type}${i}_input`;
            }
        }
        return null;
    }

    // --- Initialization ---

    _initPowerData() {
        const hwmonBase = '/sys/class/hwmon';

        try {
            const hwmonDir = Gio.File.new_for_path(hwmonBase);
            const enumerator = hwmonDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);

            let fileInfo;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                const path = `${hwmonBase}/${fileInfo.get_name()}`;
                const name = this._readFile(`${path}/name`);

                if (name === 'zenergy') {
                    this.paths.energy = this._findInputPath(path, 'energy', 'Esocket0');
                    if (this.paths.energy) { this.method = 'energy'; return; }
                }
                else if (name === 'zenpower' || name === 'k10temp') {
                    // Try direct power inputs
                    this.paths.corePower = this._findInputPath(path, 'power', name === 'zenpower' ? 'SVI2_P_Core' : 'Pcore');
                    this.paths.socPower = this._findInputPath(path, 'power', name === 'zenpower' ? 'SVI2_P_SoC' : 'Psoc');

                    if (this.paths.corePower && this.paths.socPower) {
                        this.method = 'power';
                        return;
                    }

                    // Fallback to Volts * Amps for k10temp
                    if (name === 'k10temp') {
                        this.paths.vCore = this._findInputPath(path, 'in', 'Vcore');
                        this.paths.iCore = this._findInputPath(path, 'curr', 'Icore');
                        this.paths.vSoc = this._findInputPath(path, 'in', 'Vsoc');
                        this.paths.iSoc = this._findInputPath(path, 'curr', 'Isoc');

                        if (this.paths.vCore && this.paths.iCore) {
                            this.method = 'voltage_current';
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            console.debug(`Failed to scan hwmon: ${e.message}`);
        }

        // Fallback to RAPL (Intel/AMD)
        const raplPath = '/sys/class/powercap/intel-rapl/intel-rapl:0';
        if (this._readFile(`${raplPath}/name`) === 'package-0') {
            this.paths.energy = `${raplPath}/energy_uj`;
            this.method = 'energy';
        }
    }

    // --- Polling Method ---

    /**
     * Retrieves the current CPU power consumption in Watts.
     * Call this in your GNOME extension's timeout/interval loop.
     * @returns {number|null} Power in Watts, or null if unsupported.
     */
    getPowerInWatts() {
        if (!this.method) return null;

        if (this.method === 'power') {
            // Sysfs power values are in micro-watts (uW)
            const pCore = this._readNumber(this.paths.corePower) || 0;
            const pSoc = this._readNumber(this.paths.socPower) || 0;
            return (pCore + pSoc) / 1_000_000;
        }

        else if (this.method === 'voltage_current') {
            // Volts are in mV, Amps are in mA
            const vCore = (this._readNumber(this.paths.vCore) || 0) / 1000;
            const iCore = (this._readNumber(this.paths.iCore) || 0) / 1000;
            const vSoc = (this._readNumber(this.paths.vSoc) || 0) / 1000;
            const iSoc = (this._readNumber(this.paths.iSoc) || 0) / 1000;

            return (vCore * iCore) + (vSoc * iSoc);
        }

        else if (this.method === 'energy') {
            // Energy is in micro-joules (uJ). Power = Joules / Seconds
            const currentEnergy = this._readNumber(this.paths.energy);
            const currentTime = GLib.get_monotonic_time(); // in micro-seconds (us)

            if (!currentEnergy) return null;

            let powerW = 0;
            if (this.lastEnergy > 0) {
                const deltaEnergyUJ = currentEnergy - this.lastEnergy;
                const deltaTimeUS = currentTime - this.lastTime;

                // (uJ / uS) is mathematically identical to (J / S), which is Watts.
                if (deltaTimeUS > 0) {
                    powerW = deltaEnergyUJ / deltaTimeUS;
                }
            }

            this.lastEnergy = currentEnergy;
            this.lastTime = currentTime;

            return powerW;
        }

        return null;
    }
}
