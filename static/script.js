let currentAudio = null;
let animationFrame = null;
let currentFilter = 'all';

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

document.getElementById('todo-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        task: document.getElementById('todo-task').value,
        subject: document.getElementById('todo-subject').value,
        deadline: document.getElementById('todo-deadline').value,
        priority: document.getElementById('todo-priority').value
    };

    const response = await fetch('/todos', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });

    if (response.ok) {
        e.target.reset();
        loadTodos();
        updateStats();
    }
});

function filterTodos(priority) {
    currentFilter = priority;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    loadTodos();
}

async function loadTodos() {
    const response = await fetch('/todos');
    const todos = await response.json();

    const list = document.getElementById('todo-list');
    list.innerHTML = '';

    const activeTodos = todos.filter(t => !t.completed);

    const filtered = currentFilter === 'all' ? activeTodos :
                     activeTodos.filter(t => t.priority === currentFilter);

    if (filtered.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center; padding: 30px;">No tasks in this category</p>';
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = `todo-item priority-${item.priority}`;

        const deadline = item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline';
        const priorityEmoji = {high: '🔴', medium: '🟡', low: '🟢'}[item.priority];

        div.innerHTML = `
            <div class="todo-text">
                <h4>${item.task}</h4>
                <p>📚 ${item.subject} | 📅 ${deadline}</p>
                <p style="font-size: 0.85em; color: #999;">${priorityEmoji} ${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} Priority</p>
            </div>
            <div class="todo-actions">
                <button class="icon-btn complete-btn" onclick="toggleTodo(${item.id})" title="Mark as complete">✓</button>
                <button class="icon-btn delete-btn" onclick="deleteTodo(${item.id})" title="Delete task">✕</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function toggleTodo(id) {
    await fetch(`/todos/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({completed: true})
    });
    loadTodos();
    updateStats();
}

async function deleteTodo(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        await fetch(`/todos/${id}`, {method: 'DELETE'});
        loadTodos();
        updateStats();
    }
}

document.getElementById('progress-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const mood = document.querySelector('input[name="mood"]:checked').value;

    const data = {
        subject: document.getElementById('subject').value,
        activity: document.getElementById('activity').value,
        duration: parseInt(document.getElementById('duration').value),
        mood: mood,
        notes: document.getElementById('notes').value
    };

    const response = await fetch('/progress', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });

    if (response.ok) {
        e.target.reset();
        document.querySelector('input[name="mood"][value="good"]').checked = true;
        loadProgress();
        updateStats();
    }
});

async function loadProgress() {
    const response = await fetch('/progress');
    const progress = await response.json();

    const list = document.getElementById('progress-list');
    list.innerHTML = '';

    if (progress.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center; padding: 30px;">No sessions logged yet</p>';
        return;
    }

    const recent = progress.slice(-5).reverse();

    recent.forEach(item => {
        const moodEmojis = {
            excellent: '😄',
            good: '🙂',
            neutral: '😐',
            tired: '😔'
        };

        const div = document.createElement('div');
        div.className = 'progress-item';
        div.innerHTML = `
            <h4>
                <span class="mood-indicator">${moodEmojis[item.mood] || '🙂'}</span>
                ${item.subject} - ${item.activity}
            </h4>
            <p>Duration: ${item.duration} minutes</p>
            ${item.notes ? `<p>${item.notes}</p>` : ''}
            <p style="font-size: 0.85em; color: #999;">
                ${new Date(item.timestamp).toLocaleString()}
            </p>
            <button class="delete-btn icon-btn" onclick="deleteProgress(${item.id})" style="margin-top: 10px;">Delete</button>
        `;
        list.appendChild(div);
    });
}

async function deleteProgress(id) {
    if (confirm('Are you sure you want to delete this session?')) {
        await fetch(`/progress/${id}`, {method: 'DELETE'});
        loadProgress();
        updateStats();
    }
}

async function updateStats() {
    const progressRes = await fetch('/progress');
    const progress = await progressRes.json();

    const todosRes = await fetch('/todos');
    const todos = await todosRes.json();

    const totalTime = progress.reduce((sum, p) => sum + (p.duration || 0), 0);
    const completed = todos.filter(t => t.completed).length;
    const pending = todos.filter(t => !t.completed).length;

    document.getElementById('total-sessions').textContent = progress.length;
    document.getElementById('total-time').textContent = totalTime;
    document.getElementById('completed-tasks').textContent = completed;
    document.getElementById('pending-tasks').textContent = pending;

    document.getElementById('todo-count').textContent = `${pending} active`;
    document.getElementById('session-count').textContent = `${progress.length} total`;
}

async function analyzeProgress() {
    const btn = document.getElementById('analyze-btn');
    const placeholder = document.getElementById('ai-placeholder');
    const container = document.getElementById('analysis-container');
    const status = document.getElementById('ai-status');

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon"></span><span class="btn-text">Analyzing...</span>';
    status.innerHTML = '<span class="status-dot"></span><span class="status-text">Processing your data...</span>';

    try {
        const response = await fetch('/analyze-progress', {method: 'POST'});
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        placeholder.style.display = 'none';
        container.style.display = 'block';
        container.classList.remove('analysis-hidden');

        const now = new Date();
        document.getElementById('analysis-timestamp').textContent = now.toLocaleString();
        document.getElementById('analysis-text').textContent = data.analysis;

        status.innerHTML = '<span class="status-dot"></span><span class="status-text">Speaking...</span>';

        if (data.audio_url) {
            const audio = document.getElementById('analysis-audio');
            audio.src = data.audio_url;

            audio.addEventListener('play', startWaveform);
            audio.addEventListener('pause', stopWaveform);
            audio.addEventListener('ended', () => {
                stopWaveform();
                status.innerHTML = '<span class="status-dot" style="background: #4caf50;"></span><span class="status-text">Analysis complete!</span>';
                document.querySelector('.ai-face-container').classList.remove('ai-speaking');
            });

            audio.play();
        }

    } catch (error) {
        console.error(error);
        alert('An error occurred during analysis');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon"></span><span class="btn-text">Generate AI Analysis</span>';
    }
}

function startWaveform() {
    const canvas = document.getElementById('waveform');
    const ctx = canvas.getContext('2d');
    const audio = document.getElementById('analysis-audio');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        animationFrame = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#e3f2fd');
        gradient.addColorStop(1, 'white');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

            const barGradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
            barGradient.addColorStop(0, '#1976d2');
            barGradient.addColorStop(0.5, '#64b5f6');
            barGradient.addColorStop(1, '#90caf9');

            ctx.fillStyle = barGradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

            x += barWidth;
        }
    }

    draw();
}

function stopWaveform() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    const canvas = document.getElementById('waveform');
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#e3f2fd');
    gradient.addColorStop(1, 'white');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const noteInput = document.getElementById('note-input');
const charCount = document.getElementById('char-count');

noteInput.addEventListener('input', () => {
    charCount.textContent = `${noteInput.value.length} characters`;
});

async function summarizeText() {
    const text = noteInput.value;
    const output = document.getElementById('summary-output');

    if (text.length < 50) {
        output.innerHTML = '<p style="color: #f44336;">Text is too short to summarize (minimum 50 characters)</p>';
        return;
    }

    output.innerHTML = '<p style="text-align: center;">Analyzing and summarizing your notes...</p>';

    try {
        const response = await fetch('/summarize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text})
        });

        const data = await response.json();

        if (data.summary) {
            output.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #1976d2;">
                    <h4 style="color: #1976d2; margin-bottom: 15px;">Summary</h4>
                    <p style="line-height: 1.8;">${data.summary}</p>
                </div>
            `;
        } else {
            output.textContent = data.error || 'An error occurred';
        }
    } catch (error) {
        output.innerHTML = '<p style="color: #f44336;">❌ Error generating summary</p>';
    }
}

const formulaInput = document.getElementById('formula-image');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');

if (formulaInput && previewContainer && imagePreview) {
    formulaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

async function recognizeFormula() {
    const input = formulaInput;
    const output = document.getElementById('formula-output');

    if (!input.files[0]) {
        output.innerHTML = '<p style="color: #f44336;">Please select an image first</p>';
        return;
    }

    output.innerHTML = '<p style="text-align: center;">Processing image and extracting formula...</p>';

    const formData = new FormData();
    formData.append('image', input.files[0]);

    const response = await fetch('/ocr-formula', {
            method: 'POST',
            body: formData
        });

    const data = await response.json();

    if (data.latex) {
            output.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 10px">
                    <h4 style="color: #1976d2; margin-bottom: 15px;">Extracted Formula (LaTeX)</h4>
                    <code style="display: block; background: #f5f5f5; padding: 15px; border-radius: 8px; font-family: monospace; word-wrap: break-word;">
                        ${data.latex}
                    </code>
                </div>
            `;
            document.getElementById('copy-btn').style.display = 'block';
    } else {
            output.textContent = data.error || 'Could not recognize formula';
    }
}

function copyLatex() {
    const output = document.getElementById('formula-output');
    const code = output.querySelector('code');
    const text = code ? code.textContent : output.textContent;

    navigator.clipboard.writeText(text.trim());

    const btn = document.getElementById('copy-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>✓</span> Copied!';
    btn.style.background = '#4caf50';

    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = '';
    }, 2000);
}

loadTodos();
loadProgress();
updateStats();