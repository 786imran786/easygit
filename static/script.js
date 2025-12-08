
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

// ----------------- Git Push -----------------
async function openPushModal() {
    await loadRemotes('push-remote');
    document.getElementById('push-modal').classList.remove('hidden');
}

async function confirmPush() {
    const remote = document.getElementById('push-remote').value;
    const branch = document.getElementById('push-branch').value;

    closeModal('push-modal');

    const output = document.getElementById('cmd-output');
    const branchText = branch ? `HEAD:${branch}` : 'HEAD';
    output.textContent += `> git push ${remote} ${branchText}\n`;

    const res = await API.post('/git-push', { remote, branch });
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;
}

// ----------------- Git Pull -----------------
async function openPullModal() {
    await loadRemotes('pull-remote');
    document.getElementById('pull-modal').classList.remove('hidden');
}

async function confirmPull() {
    const remote = document.getElementById('pull-remote').value;
    const branch = document.getElementById('pull-branch').value;

    closeModal('pull-modal');

    const output = document.getElementById('cmd-output');
    output.textContent += `> git pull ${remote} ${branch}\n`;

    const res = await API.post('/git-pull', { remote, branch });
    if (res.stdout) output.textContent += res.stdout;
    if (res.stderr) output.textContent += res.stderr;
    output.scrollTop = output.scrollHeight;

    // Refresh dashboard after pull
    updateDashboard();
}

// ----------------- Git Diff -----------------
async function openDiffModal() {
    await loadRemotes('diff-target'); // For now populate with remotes or branches? 
    // Actually we want local branches mostly for target, but let's load branches

    // specialized load branches for diff dropdowns
    const res = await API.get('/get-branches');
    if (!res.error) {
        const targetSelect = document.getElementById('diff-target');
        const sourceSelect = document.getElementById('diff-source');

        // Clear and repopulate, keeping static options in source
        targetSelect.innerHTML = '';

        // Add all branches to target
        res.branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            if (b === 'main') opt.selected = true;
            targetSelect.appendChild(opt);
        });

        // Add branches to source, append to existing options
        // Source has static options (HEAD, WORKTREE) already in HTML, we might want to clear and re-add or just append
        // Let's clear and re-add to be safe and clean
        sourceSelect.innerHTML = `
            <option value="HEAD" selected>Current (HEAD)</option>
            <option value="WORKTREE">Working Tree (Unstaged)</option>
        `;
        res.branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            sourceSelect.appendChild(opt);
        });
    }

    document.getElementById('diff-modal').classList.remove('hidden');
    runDiff();
}

async function runDiff() {
    const target = document.getElementById('diff-target').value;
    const source = document.getElementById('diff-source').value;
    const container = document.getElementById('diff-content');

    container.innerHTML = '<div class="text-gray-500 animate-pulse">Loading diff...</div>';

    const diffData = await API.post('/git-diff', { target, source });

    if (diffData.error) {
        container.innerHTML = `<div class="text-red-400 font-bold">Error: ${diffData.error}</div><div class="text-gray-500 text-xs">${diffData.stderr || ''}</div>`;
        return;
    }

    if (diffData.length === 0) {
        container.innerHTML = '<div class="text-gray-500 italic text-center mt-10">No changes found between these references.</div>';
        return;
    }

    renderDiff(diffData);
}

function renderDiff(data) {
    const container = document.getElementById('diff-content');
    container.innerHTML = '';

    data.forEach(file => {
        const fileBlock = document.createElement('div');
        fileBlock.className = 'mb-8 bg-gray-800 rounded-lg overflow-hidden border border-gray-700';

        // File Header
        const header = document.createElement('div');
        header.className = 'bg-gray-750 p-2 border-b border-gray-700 font-bold text-blue-300 flex items-center gap-2 sticky top-0';
        header.innerHTML = `📄 ${file.file}`;
        fileBlock.appendChild(header);

        // Code Content
        const code = document.createElement('div');
        code.className = 'p-0 text-sm font-mono overflow-x-auto';

        file.changes.forEach(change => {
            const line = document.createElement('div');
            line.className = 'px-4 py-0.5 whitespace-pre';

            if (change.type === 'header') {
                line.className += ' text-purple-400 bg-gray-900 pt-2 pb-1 border-t border-gray-800 mt-2 text-xs font-bold opacity-80';
            } else if (change.type === 'add') {
                line.className += ' bg-green-900/30 text-green-300';
            } else if (change.type === 'delete') {
                line.className += ' bg-red-900/30 text-red-300';
            } else {
                line.className += ' text-gray-400';
            }

            line.textContent = change.content;
            code.appendChild(line);
        });

        fileBlock.appendChild(code);
        container.appendChild(fileBlock);
    });
}

// ----------------- Repo Tree -----------------
let isTreeLoaded = false;

function switchSidebarTab(tab) {
    const recentBtn = document.getElementById('tab-recent');
    const filesBtn = document.getElementById('tab-files');
    const recentView = document.getElementById('view-recent');
    const filesView = document.getElementById('view-files');

    if (tab === 'recent') {
        recentBtn.className = 'flex-1 py-1 text-xs font-bold text-center rounded bg-gray-700 text-white transition-all shadow-sm';
        filesBtn.className = 'flex-1 py-1 text-xs font-bold text-center rounded text-gray-400 hover:text-gray-200 transition-all';

        recentView.classList.remove('hidden', 'opacity-0', '-translate-x-10');
        filesView.classList.add('hidden', 'opacity-0', 'translate-x-10');
    } else {
        filesBtn.className = 'flex-1 py-1 text-xs font-bold text-center rounded bg-gray-700 text-white transition-all shadow-sm';
        recentBtn.className = 'flex-1 py-1 text-xs font-bold text-center rounded text-gray-400 hover:text-gray-200 transition-all';

        filesView.classList.remove('hidden', 'opacity-0', 'translate-x-10');
        recentView.classList.add('hidden', 'opacity-0', '-translate-x-10');

        if (!isTreeLoaded && currentRepo) {
            loadRepoTree();
        }
    }
}

async function loadRepoTree() {
    const container = document.getElementById('repo-tree-container');
    container.innerHTML = '<div class="text-gray-500 animate-pulse p-2">Loading tree...</div>';

    const tree = await API.get('/get-repo-tree');
    if (tree.error) {
        container.innerHTML = `<div class="text-red-400 p-2 text-xs">${tree.error}</div>`;
        return;
    }

    container.innerHTML = '';

    // Create a recursive render function
    function createNode(node) {
        if (node.type === 'file') {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-1 hover:bg-gray-800 rounded cursor-default text-gray-300 hover:text-white transition-colors pl-4 border-l border-transparent hover:border-gray-600';
            div.innerHTML = `<span class="opacity-70">📄</span> <span class="truncate">${node.name}</span>`;
            return div;
        } else {
            // Directory
            const details = document.createElement('details');
            details.className = 'group';

            const summary = document.createElement('summary');
            summary.className = 'flex items-center gap-2 p-1 hover:bg-gray-800 rounded cursor-pointer text-blue-200 hover:text-white transition-colors list-none outline-none';
            summary.innerHTML = `
                <span class="transform transition-transform group-open:rotate-90 text-gray-500 text-[10px] w-3">▶</span>
                <span class="text-yellow-500 opacity-80">📁</span> 
                <span class="font-bold truncate">${node.name}</span>
            `;

            details.appendChild(summary);

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'pl-3 border-l border-gray-700 ml-1.5 mt-1 space-y-0.5';

            if (node.children) {
                node.children.forEach(child => {
                    childrenContainer.appendChild(createNode(child));
                });
            }

            details.appendChild(childrenContainer);
            return details;
        }
    }

    if (tree.children) {
        tree.children.forEach(child => {
            container.appendChild(createNode(child));
        });
    } else {
        container.innerHTML = '<div class="text-gray-500 italic p-2">Empty repository</div>';
    }

    isTreeLoaded = true;
}
async function openGraphModal() {
    document.getElementById("graph-modal").classList.remove("hidden");

    const data = await API.get("/get-graph");

    const container = document.getElementById("git-graph");
    container.innerHTML = ""; // reset

    // Custom template for balanced view
    const template = GitgraphJS.templateExtend("metro", {
        commit: {
            message: {
                displayAuthor: true, // Show author again for clarity
                displayHash: true, // Show hash
                font: "normal 12pt sans-serif", // Readable font
            },
            spacing: 40, // Increased from 30
            dot: {
                size: 8, // Increased from 6
                strokeWidth: 2
            }
        },
        branch: {
            lineWidth: 3,
            spacing: 30, // Increased from 20
            label: {
                font: "normal 10pt sans-serif",
                borderRadius: 5
            }
        }
    });

    const graph = GitgraphJS.createGitgraph(container, {
        orientation: "vertical-reverse",
        template: template,
        responsive: false // Disable responsive to prevent shrinking/scaling issues, let it overflow naturally
    });

    // Import data directly
    // The library expects oldest to newest? 
    // Wait, the API returns git log (usually newest to oldest).
    // graph.import expects array. Let's try passing it directly, usually it handles it or we reverse it.
    // Based on library code: const r=t.map(...).reverse(); 
    // It reverses the input internally! So if we pass Newest->Oldest (git log default), it becomes Oldest->Newest.
    // So passing `data` directly from git log is correct.
    graph.import(data);
}

// ----------------- Helpers -----------------

async function loadRemotes(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option>Loading...</option>';

    const remotes = await API.get('/get-remotes');
    select.innerHTML = '';

    if (remotes.length === 0) {
        // Fallback if no remotes found
        const opt = document.createElement('option');
        opt.value = 'origin';
        opt.textContent = 'origin (default)';
        select.appendChild(opt);
        return;
    }

    remotes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        select.appendChild(opt);
    });
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar.classList.toggle('collapsed');
}

window.onload = init;
