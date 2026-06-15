/**
 * OpenAI API Service for AI Learning Assistant
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * Common fetch utility for OpenAI API
 */
async function callOpenAI({ path, apiKey, body, customBaseUrl }) {
  const baseUrl = customBaseUrl ? customBaseUrl.replace(/\/$/, '') : DEFAULT_BASE_URL;
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error?.message) {
        errorMsg = errorData.error.message;
      }
    } catch {
      // Ignore parse errors from non-JSON response
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export function generateFallbackVisualMap(concept) {
  return {
    center: concept || 'Concept',
    nodes: [
      {
        id: 'fallback-node-1',
        title: 'Core Fundamentals',
        description: `Understanding the essential foundations and definitions of ${concept || 'this topic'}.`
      },
      {
        id: 'fallback-node-2',
        title: 'Key Applications',
        description: `How ${concept || 'this topic'} is utilized in real-world scenarios and industries.`
      },
      {
        id: 'fallback-node-3',
        title: 'Standard Methodologies',
        description: `The practical steps, procedures, or algorithms commonly associated with ${concept || 'this topic'}.`
      },
      {
        id: 'fallback-node-4',
        title: 'Advanced Outlook',
        description: `Future trends, theoretical extensions, or complex nuances of ${concept || 'this topic'}.`
      }
    ]
  };
}

function extractExplanationKeys(content, concept) {
  const normalized = {};
  for (const key of Object.keys(content)) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    normalized[normKey] = content[key];
  }

  // Find eli5
  const eli5Key = Object.keys(normalized).find(k => k.includes('eli5') || k.includes('explainlikeim5') || k.includes('simple'));
  const eli5 = eli5Key ? normalized[eli5Key] : (normalized['eli5'] || '');

  // Find professional
  const profKey = Object.keys(normalized).find(k => k.includes('professional') || k.includes('technical') || k.includes('detailed'));
  const professional = profKey ? normalized[profKey] : (normalized['professional'] || '');

  // Find step_by_step
  const stepKey = Object.keys(normalized).find(k => k.includes('step') || k.includes('tutorial') || k.includes('guide'));
  const step_by_step = stepKey ? normalized[stepKey] : (normalized['stepbystep'] || '');

  // Find examples
  const exKey = Object.keys(normalized).find(k => k.includes('example') || k.includes('case') || k.includes('realworld'));
  const examples = exKey ? normalized[exKey] : (normalized['examples'] || '');

  // Find follow_ups
  const fuKey = Object.keys(normalized).find(k => k.includes('follow'));
  let follow_ups = fuKey ? normalized[fuKey] : (normalized['followups'] || []);
  if (!Array.isArray(follow_ups)) {
    follow_ups = [];
  }

  // Find visual_map
  const vmKey = Object.keys(normalized).find(k => k.includes('visual') || k.includes('map') || k.includes('diagram'));
  let visual_map = vmKey ? normalized[vmKey] : (normalized['visualmap'] || null);

  // Validate visual map
  if (!visual_map || typeof visual_map !== 'object' || !visual_map.nodes || !Array.isArray(visual_map.nodes)) {
    visual_map = generateFallbackVisualMap(concept);
  }

  return {
    eli5: typeof eli5 === 'string' ? eli5 : (eli5 ? JSON.stringify(eli5) : ''),
    professional: typeof professional === 'string' ? professional : (professional ? JSON.stringify(professional) : ''),
    step_by_step: typeof step_by_step === 'string' ? step_by_step : (step_by_step ? JSON.stringify(step_by_step) : ''),
    examples: typeof examples === 'string' ? examples : (examples ? JSON.stringify(examples) : ''),
    follow_ups,
    visual_map
  };
}

/**
 * Fetch explanations in 5 teaching styles (including visual map) for a given concept.
 */
export async function getExplanations({ concept, apiKey, model = 'gpt-4o-mini', customBaseUrl }) {
  const systemPrompt = `You are an expert tutor. Provide explanations of the concept requested by the user in four different teaching styles:
1. ELI5 (Explain Like I'm 5): Use simple language, everyday analogies, and very basic concepts.
2. Professional: Detailed, technically accurate explanation using standard industry terminology and standard concepts.
3. Step-by-Step Teacher: Break the concept down into small, numbered, logical learning steps.
4. Real-World Examples: Explain using practical examples, code snippets (if programming related), or real-life case studies.

Also, provide exactly 3 short, relevant follow-up questions that the user might ask to deepen their understanding of this concept.

In addition, provide a visual concept mind map that outlines the core concept and exactly 4 subtopics. For each subtopic, provide a brief 1-2 sentence description.

You MUST respond with a valid JSON object matching this schema:
{
  "eli5": "string (explain like I'm 5, markdown format supported)",
  "professional": "string (technical explanation, markdown format supported)",
  "step_by_step": "string (step-by-step tutorial, markdown format supported)",
  "examples": "string (code and/or practical examples, markdown format supported)",
  "follow_ups": ["string", "string", "string"],
  "visual_map": {
    "center": "Central Concept Title",
    "nodes": [
      { "id": "node-1", "title": "Subtopic 1 Title", "description": "Short explanation of subtopic 1..." },
      { "id": "node-2", "title": "Subtopic 2 Title", "description": "Short explanation of subtopic 2..." },
      { "id": "node-3", "title": "Subtopic 3 Title", "description": "Short explanation of subtopic 3..." },
      { "id": "node-4", "title": "Subtopic 4 Title", "description": "Short explanation of subtopic 4..." }
    ]
  }
}`;

  const userPrompt = `Concept to explain: ${concept}.
Return the results in the exact JSON format specified in the system instructions. Output only a valid JSON object.`;

  const result = await callOpenAI({
    path: '/chat/completions',
    apiKey,
    customBaseUrl,
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }
  });

  try {
    const content = JSON.parse(result.choices[0].message.content);
    const extracted = extractExplanationKeys(content, concept);
    return {
      eli5: extracted.eli5 || 'No ELI5 explanation generated.',
      professional: extracted.professional || 'No Professional explanation generated.',
      step_by_step: extracted.step_by_step || 'No Step-by-Step explanation generated.',
      examples: extracted.examples || 'No Examples explanation generated.',
      follow_ups: extracted.follow_ups,
      visual_map: extracted.visual_map
    };
  } catch (err) {
    throw new Error('Failed to parse explanation response from OpenAI: ' + err.message, { cause: err });
  }
}

/**
 * Generate a 5-question multiple choice quiz for a concept.
 */
export async function getQuiz({ concept, explanationSnippet, apiKey, model = 'gpt-4o-mini', customBaseUrl }) {
  const systemPrompt = `You are an expert exam builder. Based on the concept "${concept}" and the provided explanation context, generate an interactive multiple-choice quiz of exactly 5 questions.
Each question must test the user's understanding of the concept at different levels (e.g. basic definition, application, code syntax if applicable).
Each question must have exactly 4 options.
Provide a clear explanation for why the correct option is right and others are wrong.

You MUST respond with a valid JSON object matching this schema:
{
  "questions": [
    {
      "question": "Question text...",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctAnswer": 0, // 0-based index of the correct option (0, 1, 2, or 3)
      "explanation": "Explanation for the correct answer..."
    }
  ]
}`;

  const userPrompt = `Context explanations:
${explanationSnippet}

Generate a 5-question quiz for: ${concept}.
Return the results in the exact JSON format specified in the system instructions. Output only a valid JSON object.`;

  const result = await callOpenAI({
    path: '/chat/completions',
    apiKey,
    customBaseUrl,
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }
  });

  try {
    const content = JSON.parse(result.choices[0].message.content);
    if (!content.questions || !Array.isArray(content.questions)) {
      throw new Error('Invalid JSON structure: missing questions array.');
    }
    return content.questions;
  } catch (err) {
    throw new Error('Failed to parse quiz response from OpenAI: ' + err.message, { cause: err });
  }
}

/**
 * Generate a personalized study plan for a concept.
 */
export async function getStudyPlan({ concept, goals, timeCommitment, apiKey, model = 'gpt-4o-mini', customBaseUrl }) {
  const systemPrompt = `You are a professional study coach. Create a personalized, highly structured study plan for the concept: "${concept}".
The user's goal is: "${goals}".
Their available study time is: "${timeCommitment}".

Provide a structured plan containing:
1. A descriptive title.
2. A brief overview summarizing the goals and time constraints.
3. A timeline (breaking the plan down into logical phases, days, or sessions).
   For each phase, specify:
   - "phase": Name/time-frame of the phase (e.g., "Day 1", "Session 2", "Week 1")
   - "focus": What to focus on
   - "tasks": A list of specific actionable study exercises or practice tasks
   - "resources": Recommended study resources, strategies, or search queries

You MUST respond with a valid JSON object matching this schema:
{
  "title": "Study Plan Title",
  "overview": "Overview of the plan...",
  "timeline": [
    {
      "phase": "Phase title (e.g., Session 1: Basics)",
      "focus": "Focus of this phase...",
      "tasks": ["Actionable task 1", "Actionable task 2"],
      "resources": ["Resource or tip 1", "Resource or tip 2"]
    }
  ]
}`;

  const userPrompt = `Generate study plan for concept "${concept}".
User Goals: ${goals}
Time Available: ${timeCommitment}.
Return the results in the exact JSON format specified in the system instructions. Output only a valid JSON object.`;

  const result = await callOpenAI({
    path: '/chat/completions',
    apiKey,
    customBaseUrl,
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }
  });

  try {
    const content = JSON.parse(result.choices[0].message.content);
    return {
      title: content.title || `Study Plan for ${concept}`,
      overview: content.overview || '',
      timeline: Array.isArray(content.timeline) ? content.timeline : [],
    };
  } catch (err) {
    throw new Error('Failed to parse study plan response from OpenAI: ' + err.message, { cause: err });
  }
}
