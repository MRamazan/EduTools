from flask import Flask, render_template, request, jsonify, send_file
from transformers import pipeline
from paddleocr import FormulaRecognition
from llama_cpp import Llama
from kokoro import KPipeline
import soundfile as sf
import os
import json
from datetime import datetime
import torch

app = Flask(__name__)

print("Starting EduTools...")
print("Server will be available at http://localhost:5000")

os.makedirs('data', exist_ok=True)
os.makedirs('output/audio', exist_ok=True)
os.makedirs('output/formulas', exist_ok=True)

PROGRESS_FILE = 'data/progress.json'
TODO_FILE = 'data/todos.json'

summarizer = None
formula_model = None
llm = None
tts_pipeline = None


def get_summarizer():
    global summarizer
    if summarizer is None:
        print("Loading summarizer...")
        summarizer = pipeline("summarization", model="Falconsai/text_summarization", device=-1)
    return summarizer


def get_formula_model():
    global formula_model
    if formula_model is None:
        print("Loading formula OCR...")
        formula_model = FormulaRecognition(model_name="PP-FormulaNet_plus-L")
    return formula_model


def get_llm():
    global llm
    if llm is None:
        print("Loading LLM...")
        llm = Llama.from_pretrained(
            repo_id="RichardErkhov/LLM360_-_AmberChat-gguf",
            filename="AmberChat.Q8_0.gguf",
            n_ctx=512,
            n_gpu_layers=0
        )
    return llm


def get_tts():
    global tts_pipeline
    if tts_pipeline is None:
        print("Loading TTS...")
        torch.set_default_device('cpu')
        tts_pipeline = KPipeline(lang_code='a', device='cpu')
    return tts_pipeline


def load_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return []


def save_json(filepath, data):
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/todos', methods=['GET'])
def get_todos():
    return jsonify(load_json(TODO_FILE))


@app.route('/todos', methods=['POST'])
def add_todo():
    data = request.json
    todos = load_json(TODO_FILE)
    entry = {
        'id': len(todos),
        'task': data.get('task'),
        'subject': data.get('subject'),
        'priority': data.get('priority', 'medium'),
        'deadline': data.get('deadline'),
        'completed': False,
        'created_at': datetime.now().isoformat()
    }
    todos.append(entry)
    save_json(TODO_FILE, todos)
    return jsonify(entry)


@app.route('/todos/<int:id>', methods=['PUT'])
def update_todo(id):
    todos = load_json(TODO_FILE)
    for todo in todos:
        if todo['id'] == id:
            todo['completed'] = request.json.get('completed', todo['completed'])
            break
    save_json(TODO_FILE, todos)
    return jsonify({'success': True})


@app.route('/todos/<int:id>', methods=['DELETE'])
def delete_todo(id):
    todos = load_json(TODO_FILE)
    todos = [t for t in todos if t['id'] != id]
    save_json(TODO_FILE, todos)
    return jsonify({'success': True})


@app.route('/progress', methods=['GET'])
def get_progress():
    return jsonify(load_json(PROGRESS_FILE))


@app.route('/progress', methods=['POST'])
def add_progress():
    data = request.json
    progress = load_json(PROGRESS_FILE)
    entry = {
        'id': len(progress),
        'subject': data.get('subject'),
        'activity': data.get('activity'),
        'duration': data.get('duration'),
        'notes': data.get('notes'),
        'mood': data.get('mood', 'neutral'),
        'timestamp': datetime.now().isoformat()
    }
    progress.append(entry)
    save_json(PROGRESS_FILE, progress)
    return jsonify(entry)


@app.route('/progress/<int:id>', methods=['DELETE'])
def delete_progress(id):
    progress = load_json(PROGRESS_FILE)
    progress = [p for p in progress if p['id'] != id]
    save_json(PROGRESS_FILE, progress)
    return jsonify({'success': True})


@app.route('/analyze-progress', methods=['POST'])
def analyze_progress():
    try:
        progress = load_json(PROGRESS_FILE)
        todos = load_json(TODO_FILE)

        if not progress:
            return jsonify({'error': 'No progress data to analyze'}), 400

        subjects = {}
        total_duration = 0
        moods = []
        activities = []
        recent_sessions = []

        for p in progress:
            subj = p.get('subject', 'Unknown')
            dur = p.get('duration', 0)
            subjects[subj] = subjects.get(subj, 0) + dur
            total_duration += dur
            if p.get('mood'):
                moods.append(p['mood'])
            if p.get('activity'):
                activities.append(p['activity'])
            recent_sessions.append(f"{subj} ({dur} min)")

        completed_todos = sum(1 for t in todos if t.get('completed'))
        total_todos = len(todos)
        pending_todos = total_todos - completed_todos

        most_studied = max(subjects.items(), key=lambda x: x[1]) if subjects else ('Unknown', 0)

        mood_counts = {}
        for mood in moods:
            mood_counts[mood] = mood_counts.get(mood, 0) + 1
        dominant_mood = max(mood_counts.items(), key=lambda x: x[1])[0] if mood_counts else 'neutral'

        recent_text = ', '.join(recent_sessions[-3:]) if len(recent_sessions) > 0 else 'None'

        summary = f"Student completed {len(progress)} study sessions totaling {total_duration} minutes. "
        summary += f"Subjects studied: {', '.join([f'{k} ({v} minutes)' for k, v in subjects.items()])}. "
        summary += f"Most studied subject: {most_studied[0]} with {most_studied[1]} minutes. "
        summary += f"Recent sessions: {recent_text}. "
        summary += f"Completed {completed_todos} out of {total_todos} tasks ({pending_todos} pending). "
        summary += f"Overall mood during sessions: mostly {dominant_mood}."

        print(summary)

        import random

        parts = []

        openings = [
            f"I've analyzed your study data and I'm impressed with what I'm seeing!",
            f"Great work! Let me share what stands out from your recent study sessions.",
            f"I've been looking over your progress, and there's a lot to celebrate here!",
            f"Your study data shows some really positive patterns - let's talk about them."
        ]
        parts.append(random.choice(openings))

        if len(progress) == 1:
            parts.append(f"You've completed your first study session - that's an excellent start to building a habit.")
        elif len(progress) < 5:
            parts.append(f"You've logged {len(progress)} study sessions so far, which shows you're building momentum.")
        elif len(progress) < 10:
            parts.append(f"With {len(progress)} study sessions completed, you're developing real consistency.")
        else:
            parts.append(
                f"You've completed {len(progress)} study sessions - that's the kind of dedication that leads to real progress!")

        if len(subjects) > 1:
            parts.append(
                f"I notice you've been particularly focused on {most_studied[0]}, spending {most_studied[1]} minutes on it, while also balancing {len(subjects) - 1} other subject{'s' if len(subjects) > 2 else ''}.")
        else:
            parts.append(
                f"You've dedicated all {most_studied[1]} minutes to {most_studied[0]}, showing strong focus on mastering this subject.")

        if total_duration < 60:
            parts.append(f"Your {total_duration} minutes of study time is a solid foundation to build on.")
        elif total_duration < 120:
            parts.append(
                f"You've invested {total_duration} minutes total - that's over an hour of focused learning, which is impressive!")
        elif total_duration < 240:
            parts.append(
                f"Wow, {total_duration} minutes of study time! That's over {total_duration // 60} hours of dedicated work.")
        else:
            parts.append(
                f"You've accumulated an incredible {total_duration} minutes ({total_duration // 60} hours!) of focused study time.")

        if total_todos > 0:
            completion_rate = (completed_todos / total_todos) * 100
            if completion_rate == 100:
                parts.append(
                    f"Even better - you've completed all {completed_todos} of your tasks! That's perfect execution.")
            elif completion_rate >= 66:
                parts.append(
                    f"You've checked off {completed_todos} out of {total_todos} tasks ({int(completion_rate)}%), which is strong progress.")
            elif completion_rate >= 33:
                parts.append(
                    f"You're making headway on your tasks with {completed_todos} out of {total_todos} completed. Keep that momentum going!")
            else:
                parts.append(
                    f"You have {pending_todos} tasks still pending. Consider tackling the highest priority ones in your next session.")

        mood_comments = {
            'excellent': "Your sessions have been feeling excellent, which means you're in the zone!",
            'good': "You've been feeling good during your sessions, which is exactly where you want to be.",
            'neutral': "Your mood has been steady during study sessions. Consider mixing in breaks or switching subjects if energy dips.",
            'tired': "I notice you've been feeling tired. Remember to take breaks, stay hydrated, and don't push past your limits."
        }
        if dominant_mood in mood_comments:
            parts.append(mood_comments[dominant_mood])

        closings = [
            "Keep up this consistent effort and you'll see real results!",
            "This is the kind of steady progress that leads to mastery. Stay the course!",
            "You're building strong study habits. Trust the process and keep going!",
            "Your dedication is paying off. Stay focused and watch how much you'll achieve!"
        ]
        parts.append(random.choice(closings))

        analysis_text = " ".join(parts)
        print(analysis_text)

        tts = get_tts()
        audio_id = int(datetime.now().timestamp())
        audio_path = f'output/audio/analysis_{audio_id}.wav'

        generator = tts(analysis_text, voice='af_heart')
        audio_chunks = []

        for _, _, audio in generator:
            audio_chunks.append(audio)

        if audio_chunks:
            import numpy as np
            full_audio = np.concatenate(audio_chunks)
            sf.write(audio_path, full_audio, 24000)

        return jsonify({
            'analysis': analysis_text,
            'audio_url': f'/audio/{audio_id}'
        })

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/audio/<int:audio_id>')
def get_audio(audio_id):
    audio_path = f'output/audio/analysis_{audio_id}.wav'
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype='audio/wav')
    return jsonify({'error': 'Audio not found'}), 404


@app.route('/summarize', methods=['POST'])
def summarize():
    try:
        text = request.json.get('text', '')
        if len(text) < 50:
            return jsonify({'error': 'Text too short'}), 400

        model = get_summarizer()
        result = model(text, max_length=384, min_length=128, do_sample=False)
        return jsonify({'summary': result[0]['summary_text']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/ocr-formula', methods=['POST'])
def ocr_formula():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400

        image = request.files['image']
        temp_path = f'output/formulas/temp_{datetime.now().timestamp()}.png'
        image.save(temp_path)

        model = get_formula_model()
        output = model.predict(input=temp_path, batch_size=1)
        latex = ""
        for res in output:
            latex = res["rec_formula"]

        os.remove(temp_path)
        return jsonify({'latex': latex if latex else 'Could not recognize formula'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)