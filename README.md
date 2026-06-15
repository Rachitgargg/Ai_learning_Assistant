# 🧠 AI Learning Assistant

An advanced, high-fidelity personalized learning hub built with **React**, **Vite**, and **Vanilla CSS**. It integrates with high-performance **Groq LLMs** (using OpenAI-compatible endpoints) and **Supabase** to help users break down, visualize, plan, and self-assess their understanding of any concept.

---

## ✨ Key Features

*   **Four Distinct Learning Styles**:
    *   🧒 **ELI5 (Explain Like I'm 5)**: High-level intuitive analogies and simple vocabulary.
    *   💼 **Professional**: Precise industry-standard concepts and technical depth.
    *   🏫 **Step-by-Step Teacher**: Logical sequence, breaking down complex theories into structured checkpoints.
    *   💻 **Real-World Examples**: Hands-on code snippets, practical case studies, and scenarios.
*   **Visual Concept Mind Maps**: Generates dynamic graphical nodes connecting the core topic with 4 core subtopics, complete with hover descriptions.
*   **Interactive Assessments**: 5-question multi-choice quizzes with real-time grading, immediate answer verification, and detailed option-by-option rationale.
*   **Dynamic Study Plans**: Time-budgeted roadmap generator that breaks down the subject into custom phases, specific task checklists, and resource pointers.
*   **AI Accelerator Labs**: One-click quick-start labs (Concept Battle, Exam Prep, ELI5 Mode, Roadmap Lab) to automatically target specific learning modes.
*   **Topic Auto-Classifier**: Automatically detects subject categories (e.g., Computer Science, Math, Science, Humanities) and highlights them with custom visual badges.
*   **Supabase Cloud Sync**: Effortless toggle between local cache storage and secure cloud synchronization to backup learning history and quiz statistics.

---

## 🛠️ Tech Stack

*   **Frontend Library**: React 19 (Hooks, Context, Dynamic State)
*   **Build Tool**: Vite
*   **Styling**: Pure CSS (utilizing rich dark modes, glassmorphism, dynamic transitions, and responsive grid layouts)
*   **AI Integration**: Groq API (utilizing JSON schema outputs for robust rendering)
*   **Database Service**: Supabase Client

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (version 18+ is recommended).

### 2. Installation
Clone the repository and install the dependencies:
```bash
# Install NPM packages
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory and add your Groq API credentials. You can also pre-configure your Supabase credentials here (or connect them directly inside the app settings UI):

```env
# Groq API Configuration
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_GROQ_API_BASE_URL=https://api.groq.com/openai/v1
VITE_GROQ_DEFAULT_MODEL=llama-3.1-8b-instant

# Optional Supabase Auto-Config
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Running the Project
Launch the local development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 💾 Supabase Database Setup

If you choose to sync your study history and metrics to the cloud, execute the following SQL scripts in your **Supabase SQL Editor** to establish the required tables:

```sql
-- 1. Create Learning History table
CREATE TABLE public.learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    explanations JSONB NOT NULL,
    visual_map JSONB,
    follow_ups JSONB,
    quizzes JSONB,
    study_plan JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Create Learning Stats table for user tracking
CREATE TABLE public.learning_stats (
    id INT PRIMARY KEY DEFAULT 1,
    quizzes_taken INT DEFAULT 0,
    avg_score NUMERIC(5,2) DEFAULT 0.00,
    total_scores INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize the stats row
INSERT INTO public.learning_stats (id, quizzes_taken, avg_score, total_scores)
VALUES (1, 0, 0.00, 0)
ON CONFLICT (id) DO NOTHING;
```

---

## 📈 Quality Assurance & Linting

Keep the code clean and compile-safe. To run standard verification steps:

```bash
# Audit hooks and eslint standards
npm run lint

# Compile and optimize assets for deployment
npm run build
```
