from flask import Flask, jsonify, request, send_from_directory
import os
import base64
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from the .env file
load_dotenv()

# Configure Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("⚠️ Warning: GEMINI_API_KEY not found in .env file!")
else:
    genai.configure(api_key=api_key)

app = Flask(__name__, static_folder='static', template_folder='.')

medicines = []
taken_records = {}

CONTENT = {
    "tips": [
        "Drink a full glass of water first thing in the morning to kickstart your metabolism.",
        "Take a 10-minute walk after meals to help digestion and manage blood sugar levels.",
        "Ensure you get 7 to 8 hours of quality sleep every night for optimal immune function.",
        "Practice deep breathing for 2 minutes whenever you feel overwhelmed."
    ],
    "exercises": [
        {
            "id": "ex1",
            "title": "Gentle Morning Stretch",
            "type": "Yoga",
            "level": "Beginner",
            "minutes": 5,
            "steps": [
                "Sit comfortably with a straight spine.",
                "Inhale deeply while raising your arms overhead.",
                "Exhale slowly and gently twist to the right.",
                "Hold for 30 seconds, then repeat on the left side."
            ]
        },
        {
            "id": "ex2",
            "title": "Joint Mobility Routine",
            "type": "Exercise",
            "level": "All Levels",
            "minutes": 7,
            "steps": [
                "Rotate your neck gently in slow circles clockwise, then counter-clockwise.",
                "Roll your shoulders backward 10 times.",
                "Extend your arms and rotate your wrists and ankles.",
                "Perform 5 gentle seated knee extensions."
            ]
        }
    ]
}

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/medicines', methods=['GET', 'POST'])
def handle_medicines():
    date = request.args.get('date', '')
    if request.method == 'GET':
        taken_list = taken_records.get(date, [])
        return jsonify({"medicines": medicines, "taken": taken_list})
    
    elif request.method == 'POST':
        data = request.json
        new_med = {
            "id": str(len(medicines) + 1),
            "name": data.get("name"),
            "dose": data.get("dose", ""),
            "time": data.get("time")
        }
        medicines.append(new_med)
        return jsonify({"success": True, "medicine": new_med})

@app.route('/api/medicines/<med_id>', methods=['DELETE'])
def delete_medicine(med_id):
    global medicines
    medicines = [m for m in medicines if m["id"] != med_id]
    return jsonify({"success": True})

@app.route('/api/taken', methods=['POST'])
def mark_taken():
    data = request.json
    med_id = data.get("id")
    date = data.get("date")
    is_taken = data.get("taken")
    
    if date not in taken_records:
        taken_records[date] = []
        
    if is_taken and med_id not in taken_records[date]:
        taken_records[date].append(med_id)
    elif not is_taken and med_id in taken_records[date]:
        taken_records[date].remove(med_id)
        
    return jsonify({"success": True})

@app.route('/api/content', methods=['GET'])
def get_content():
    return jsonify(CONTENT)

@app.route('/api/scan', methods=['POST'])
def scan_medicine():
    data = request.json
    image_data = data.get("image")
    if not image_data:
        return jsonify({"error": "No image provided"}), 400
    
    if not api_key:
        return jsonify({"error": "Gemini API key is missing on the server."}), 500

    try:
        header, encoded = image_data.split(",", 1)
        image_bytes = base64.b64decode(encoded)

        model = genai.GenerativeModel('gemini-3.8-flash')
        response = model.generate_content([
            "Analyze this medicine box, bottle, or strip image. Provide the medication name, dosage, and clear instructions or warnings based on the label. Write your response in clean, plain text without using any markdown symbols like hashtags (###) or asterisks (**).",
            {"mime_type": "image/jpeg", "data": image_bytes}
        ])
        return jsonify({"result": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to analyze image with AI: {str(e)}"}), 500

if __name__ == '__main__':
    print("🚀 MediMate server running at: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)