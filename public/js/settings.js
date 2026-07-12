// Audio/control settings, shared between the options modal and the stereo panel.
export const S = { masterVol: .8, musicVol: .6, sensitivity: 5 };

export function initSettingsUI(setMusicVolume) {
  document.getElementById('omv').oninput = function () {
    S.masterVol = this.value / 100;
    document.getElementById('lmv').textContent = this.value;
  };
  document.getElementById('omm').oninput = function () {
    document.getElementById('lmm').textContent = this.value;
    setMusicVolume(this.value / 100);
  };
  document.getElementById('osens').oninput = function () {
    S.sensitivity = +this.value;
    document.getElementById('lsens').textContent = this.value;
  };
}
