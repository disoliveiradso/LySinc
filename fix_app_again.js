const fs = require('fs');
let app = fs.readFileSync('app.js', 'utf8');

// 1. Fix updateLoginButtonsState
const loginStateReplaceStr = `    updateLoginButtonsState() {
        this.updateSettingsModalButtons();
    }`;
app = app.replace(/    updateLoginButtonsState\(\) \{[\s\S]*?this\.updateSettingsModalButtons\(\);\n    \}/, loginStateReplaceStr);

// 2. Fix copy icon logic
app = app.replace(
    /    updateSettingsModalButtons\(\) \{\n        const clientId = Config\.getClientId\(\);\n        const sysId = Config\.getSystemClientId\(\);\n        const isSystemAccount = clientId && sysId && clientId === sysId;/,
    `    updateSettingsModalButtons() {
        const clientId = Config.getClientId();
        const sysId = Config.getSystemClientId();
        const isSystemAccount = clientId && sysId && clientId === sysId;
        const copyBtn = document.getElementById('btn-copy-client-id');`
);

app = app.replace(
    /            if \(this\.settingsInputClientIdReadonly\) \{\n                this\.settingsInputClientIdReadonly\.value = isSystemAccount \? 'Conta do Sistema' : clientId;\n            \}/,
    `            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = isSystemAccount ? 'Conta do Sistema' : clientId;
            }
            if (copyBtn) copyBtn.classList.remove('hidden');`
);

app = app.replace(
    /            if \(this\.settingsInputClientIdReadonly\) \{\n                this\.settingsInputClientIdReadonly\.value = 'Nenhum Client ID cadastrado';\n            \}/,
    `            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = 'Nenhum Client ID cadastrado';
            }
            if (copyBtn) copyBtn.classList.add('hidden');`
);

// 3. Add btnFlowStep3Back
app = app.replace(
    /        if \(this\.btnFlowStep3Finish\) \{\n            this\.btnFlowStep3Finish\.addEventListener\('click', \(\) => \{\n                this\.updateLoginButtonsState\(\);\n                SpotifyService\.login\(\);\n            \}\);\n        \}/,
    `        if (this.btnFlowStep3Finish) {
            this.btnFlowStep3Finish.addEventListener('click', () => {
                this.updateLoginButtonsState();
                SpotifyService.login();
            });
        }
        
        this.btnFlowStep3Back = document.getElementById('btn-flow-step3-back');
        if (this.btnFlowStep3Back) {
            this.btnFlowStep3Back.addEventListener('click', () => this.showScreen('pre-login'));
        }`
);

// 4. Scroll to top on showScreen
app = app.replace(
    /        \} else if \(screenName === 'idle'\) \{\n            if \(this\.screenIdle\) this\.screenIdle\.classList\.remove\('hidden'\);\n        \}\n    \}/,
    `        } else if (screenName === 'idle') {
            if (this.screenIdle) this.screenIdle.classList.remove('hidden');
        }
        window.scrollTo(0, 0);
    }`
);

fs.writeFileSync('app.js', app, 'utf8');
