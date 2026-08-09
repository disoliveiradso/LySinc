const fs = require('fs');
let app = fs.readFileSync('app.js', 'utf8');

app = app.replace(
    /this\.btnFlowStep2Save\.classList\.remove\('opacity-50', 'pointer-events-none', 'bg-neutral-600'\);/g,
    "this.btnFlowStep2Save.classList.remove('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');"
);
app = app.replace(
    /this\.btnFlowStep2Save\.classList\.add\('bg-emerald-500', 'hover:bg-emerald-400'\);/g,
    "this.btnFlowStep2Save.classList.add('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');"
);
app = app.replace(
    /this\.btnFlowStep2Save\.classList\.add\('opacity-50', 'pointer-events-none', 'bg-neutral-600'\);/g,
    "this.btnFlowStep2Save.classList.add('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');"
);
app = app.replace(
    /this\.btnFlowStep2Save\.classList\.remove\('bg-emerald-500', 'hover:bg-emerald-400'\);/g,
    "this.btnFlowStep2Save.classList.remove('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');"
);

const loginStateReplaceStr = `    updateLoginButtonsState() {
        this.updateSettingsModalButtons();
    }`;
app = app.replace(/    updateLoginButtonsState\(\) \{[\s\S]*?this\.updateSettingsModalButtons\(\);\n    \}/, loginStateReplaceStr);

const connectListener = `        if (this.btnConnect) {
            this.btnConnect.addEventListener('click', () => {
                if (!Config.getClientId()) {
                    this.showToast('O login só será efetivado devidamente se você inserir um Client ID ou usar a Conta do Sistema.', 'warning', 5000);
                    this.showScreen('flow-step-1');
                    if (this.btnLoginSystemAccount) {
                        this.btnLoginSystemAccount.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-neutral-900', 'animate-pulse');
                        setTimeout(() => {
                            this.btnLoginSystemAccount.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-neutral-900', 'animate-pulse');
                        }, 3000);
                    }
                    return;
                }
                SpotifyService.login();
            });
        }`;
app = app.replace(/        this\.btnConnect\.addEventListener\('click', \(\) => SpotifyService\.login\(\)\);/, connectListener);

app = app.replace(
    /            if \(this\.settingsInputClientIdReadonly\) \{\n                this\.settingsInputClientIdReadonly\.value = isSystemAccount \? 'Conta do Sistema' : clientId;\n            \}/,
    `            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = isSystemAccount ? 'Conta do Sistema' : clientId;
            }
            const copyBtn = document.getElementById('btn-copy-client-id');
            if (copyBtn) copyBtn.classList.remove('hidden');`
);

app = app.replace(
    /            if \(this\.settingsInputClientIdReadonly\) \{\n                this\.settingsInputClientIdReadonly\.value = 'Nenhum Client ID cadastrado';\n            \}\n        \}/,
    `            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = 'Nenhum Client ID cadastrado';
            }
            const copyBtn = document.getElementById('btn-copy-client-id');
            if (copyBtn) copyBtn.classList.add('hidden');
        }`
);

fs.writeFileSync('app.js', app, 'utf8');
