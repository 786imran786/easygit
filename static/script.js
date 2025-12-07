
const API = {
    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async get(url) {
        const res = await fetch(url);
        return res.json();
    }
};
let currentRepo = null;

async function init() {
    loadRecentRepos();
    // Try to restore session
    const res = await API.get('/get-current-repo');
    if (res.repo) {
        setRepo(res.repo);
    }
}

async function selectRepoDialog() {
    const res = await API.post('/select-repo-dialog', {});
    if (res.status === 'success') {
        setRepo(res.repo);
    }
}

async function setRepo(path) {
    const res = await API.post('/set-repo', { repo: path });
    if (res.status === 'success') {
        currentRepo = res.repo;
        document.getElementById('current-repo-display').textContent = path;
        loadRecentRepos();
        updateDashboard();
    } else {
        alert(res.message);
    }
}

async function loadRecentRepos() {
    const repos = await API.get('/get-recent-repos');
    const list = document.getElementById('recent-repos-list');
    list.innerHTML = '';
    repos.forEach(path => {
        const item = document.createElement('div');
        item.className = 'p-2 hover:bg-gray-700 cursor-pointer text-sm truncate rounded';
        item.textContent = path;
        item.onclick = () => setRepo(path);
        list.appendChild(item);
    });
}

async function updateDashboard() {
    if (!currentRepo) return;

    // Status
    const status = await API.get('/get-status');
    if (!status.error) {
        renderFileList('staged-list', status.staged, 'text-green-400');
        renderFileList('unstaged-list', status.unstaged, 'text-red-400');
    }

    // History
    const history = await API.get('/get-history');
    if (!history.error) {
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        history.forEach(commit => {
            const div = document.createElement('div');
            div.className = 'border-b border-gray-700 p-2 text-sm';
            div.innerHTML = `
                <div class="flex justify-between">
                    <span class="text-yellow-500 font-mono">${commit.hash}</span>
                    <span class="text-gray-400 text-xs">${commit.time}</span>
                </div>
                <div class="font-bold text-gray-200">${commit.message}</div>
                <div class="text-gray-500 text-xs">${commit.author}</div>
            `;
            list.appendChild(div);
        });
    }

    // Branches
    const branches = await API.get('/get-branches');
    if (!branches.error) {
        const select = document.getElementById('branch-select');
        select.innerHTML = '';
        branches.branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            if (b === branches.current) opt.selected = true;
            select.appendChild(opt);
        });
    }
}

function renderFileList(elementId, files, colorClass) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';
    const isStaged = elementId === 'staged-list';

    if (files.length === 0) {
        list.innerHTML = '<div class="text-gray-500 italic text-sm p-2">No files</div>';
        return;
    }
    files.forEach(f => {
        const div = document.createElement('div');
        div.className = `p-1 text-sm font-mono flex gap-2 items-center hover:bg-gray-700 cursor-pointer group ${colorClass}`;
        div.title = isStaged ? "Click to Unstage" : "Click to Stage";
        div.onclick = () => isStaged ? gitReset(f.file) : gitAdd(f.file);

        div.innerHTML = `
            <span class="font-bold w-6 border-r border-gray-600">${f.status}</span> 
            <span class="flex-1">${f.file}</span>
            <span class="text-gray-500 group-hover:text-white text-xs px-2 opacity-0 group-hover:opacity-100 transition">
                ${isStaged ? '➖ Unstage' : '➕ Add'}
            </span>
        `;
        list.appendChild(div);
    });
}

async function gitAdd(file) {
    await API.post('/git-add', { file });
    updateDashboard();
}

async function gitAddAll() {
    await API.post('/git-add-all', {});
    updateDashboard();
}

async function gitReset(file) {
    await API.post('/git-reset', { file });
    updateDashboard();
}

async function runCommand() {
    const input = document.getElementById('cmd-input');
    const output = document.getElementById('cmd-output');
    const cmd = input.value;
    if (!cmd) return;

    output.textContent += `> ${cmd}\n`;
    input.value = '';

    const res = await API.post('/run-command', { command: cmd });
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;

    output.scrollTop = output.scrollHeight;

    // Refresh dashboard as command might have changed state
    updateDashboard();
}

async function createBranch() {
    const name = prompt("Enter new branch name:");
    if (name) {
        await API.post('/create-branch', { name });
        updateDashboard();
    }
}

async function switchBranch() {
    const select = document.getElementById('branch-select');
    const name = select.value;
    await API.post('/switch-branch', { name });
    updateDashboard();
}

async function aiCommit() {
    const output = document.getElementById('cmd-output');
    output.textContent += `> AI Commit...\n`;

    const res = await API.post('/ai-commit', {});
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;
    updateDashboard();
}

async function manualCommit() {
    const msgInput = document.getElementById('commit-msg');
    const msg = msgInput.value;
    if (!msg) {
        alert("Please enter a commit message");
        return;
    }

    const res = await API.post('/manual-commit', { message: msg });

    const output = document.getElementById('cmd-output');
    output.textContent += `> git commit -m "${msg}"\n`;
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;

    msgInput.value = ''; // Clear input
    updateDashboard();
}

async function gitPush() {
    const output = document.getElementById('cmd-output');
    output.textContent += `> git push origin HEAD\n`;

    const res = await API.post('/git-push', {});
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;
}

async function gitPull() {
    const output = document.getElementById('cmd-output');
    output.textContent += `> git pull origin main\n`;

    const res = await API.post('/git-pull', {});
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;
}

window.onload = init;
