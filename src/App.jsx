import { useState, useEffect } from 'react';
import { getExplanations, getQuiz, getStudyPlan } from './services/ai';
import './App.css'; // Importing template styling just in case, but index.css contains our primary design tokens

// --- Simple Inline Markdown Parser ---
function renderMarkdown(text) {
  if (!text) return null;
  
  // Split by fenced code blocks (```)
  const parts = text.split(/```/g);
  
  return parts.map((part, index) => {
    // If odd index, this is a code block
    if (index % 2 === 1) {
      const lines = part.split('\n');
      let language = 'code';
      let codeContent = part;
      if (lines[0] && lines[0].trim().match(/^[a-zA-Z0-9_-]+$/)) {
        language = lines[0].trim();
        codeContent = lines.slice(1).join('\n');
      }
      return (
        <pre key={index}>
          <code className={`language-${language}`}>{codeContent.trim()}</code>
        </pre>
      );
    }
    
    // For even index, parse lines
    const lines = part.split('\n');
    const elements = [];
    let currentList = null; // 'ul' | 'ol' | null
    let listItems = [];

    const flushList = (key) => {
      if (currentList === 'ul') {
        elements.push(<ul key={`ul-${key}`}>{listItems}</ul>);
      } else if (currentList === 'ol') {
        elements.push(<ol key={`ol-${key}`}>{listItems}</ol>);
      }
      listItems = [];
      currentList = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Helper to render inline markdown (bold, italic, inline code)
      const renderInline = (txt) => {
        const boldParts = txt.split(/\*\*/g);
        return boldParts.map((bPart, bIdx) => {
          let content = bPart;
          const parseItalicAndCode = (segment) => {
            const codeParts = segment.split(/`/g);
            return codeParts.map((cPart, cIdx) => {
              if (cIdx % 2 === 1) {
                return <code key={`c-${cIdx}`}>{cPart}</code>;
              }
              const italicParts = cPart.split(/\*/g);
              return italicParts.map((iPart, iIdx) => {
                if (iIdx % 2 === 1) {
                  return <em key={`i-${iIdx}`}>{iPart}</em>;
                }
                return iPart;
              });
            });
          };

          if (bIdx % 2 === 1) {
            return <strong key={`b-${bIdx}`}>{parseItalicAndCode(content)}</strong>;
          }
          return parseItalicAndCode(content);
        });
      };

      // Check block types
      if (trimmedLine.startsWith('# ')) {
        flushList(i);
        elements.push(<h2 key={i}>{renderInline(trimmedLine.substring(2))}</h2>);
      } else if (trimmedLine.startsWith('## ')) {
        flushList(i);
        elements.push(<h2 key={i}>{renderInline(trimmedLine.substring(3))}</h2>);
      } else if (trimmedLine.startsWith('### ')) {
        flushList(i);
        elements.push(<h3 key={i}>{renderInline(trimmedLine.substring(4))}</h3>);
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        if (currentList !== 'ul') {
          flushList(i);
          currentList = 'ul';
        }
        listItems.push(<li key={`li-${i}`}>{renderInline(trimmedLine.substring(2))}</li>);
      } else if (/^\d+\.\s/.test(trimmedLine)) {
        if (currentList !== 'ol') {
          flushList(i);
          currentList = 'ol';
        }
        const content = trimmedLine.replace(/^\d+\.\s/, '');
        listItems.push(<li key={`li-${i}`}>{renderInline(content)}</li>);
      } else if (trimmedLine.startsWith('>')) {
        flushList(i);
        elements.push(<blockquote key={i}>{renderInline(trimmedLine.substring(1).trim())}</blockquote>);
      } else if (trimmedLine === '') {
        if (currentList) flushList(i);
      } else {
        flushList(i);
        elements.push(<p key={i}>{renderInline(line)}</p>);
      }
    }
    flushList(lines.length);
    return elements;
  });
}

function createTopicObject(query, data) {
  return {
    id: Date.now().toString(),
    topic: query,
    timestamp: new Date().toLocaleString(),
    explanations: {
      eli5: data.eli5,
      professional: data.professional,
      step_by_step: data.step_by_step,
      examples: data.examples
    },
    followUps: data.follow_ups,
    quizzes: null, // to be generated on-demand
    studyPlan: null // to be generated on-demand
  };
}

function App() {
  // --- Settings State ---
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('ai_tutor_api_key') || import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_OPENAI_API_KEY || '';
  });
  const [model, setModel] = useState(() => {
    return localStorage.getItem('ai_tutor_model') || import.meta.env.VITE_GROQ_DEFAULT_MODEL || 'llama-3.1-8b-instant';
  });
  const [customBaseUrl, setCustomBaseUrl] = useState(() => {
    return localStorage.getItem('ai_tutor_custom_url') || import.meta.env.VITE_GROQ_API_BASE_URL || '';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  // --- History & Stats State ---
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('ai_tutor_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('ai_tutor_stats');
    return saved ? JSON.parse(saved) : { quizzesTaken: 0, avgScore: 0, totalScores: 0 };
  });

  // --- Current Learning Workspace State ---
  const [currentTopicId, setCurrentTopicId] = useState(null);
  const [activeTab, setActiveTab] = useState('explain'); // 'explain' | 'quiz' | 'plan'
  const [explanationStyle, setExplanationStyle] = useState('eli5'); // 'eli5' | 'professional' | 'step_by_step' | 'examples'
  const [searchInput, setSearchInput] = useState('');
  
  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [quizLoading, setQuizLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- Active Quiz State ---
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState([]); // Array of { questionIdx, selectedIdx, isCorrect }
  const [quizCompleted, setQuizCompleted] = useState(false);

  // --- Active Study Plan Form State ---
  const [studyGoals, setStudyGoals] = useState('');
  const [studyTime, setStudyTime] = useState('2 hours a week');

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('ai_tutor_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('ai_tutor_stats', JSON.stringify(stats));
  }, [stats]);

  // Find active topic
  const activeTopic = history.find(item => item.id === currentTopicId);

  // --- Action Handlers ---

  const handleSearch = async (topicToSearch) => {
    const query = (topicToSearch || searchInput).trim();
    if (!query) return;

    if (!apiKey) {
      setError('Please set your OpenAI API key in Settings first to generate custom lessons!');
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setLoadingMessage('Consulting the AI Tutor for explanations and follow-ups...');
    setError(null);

    try {
      const data = await getExplanations({
        concept: query,
        apiKey,
        model,
        customBaseUrl
      });

      const newTopic = createTopicObject(query, data);

      setHistory(prev => [newTopic, ...prev]);
      setCurrentTopicId(newTopic.id);
      setActiveTab('explain');
      setExplanationStyle('eli5');
      setSearchInput('');
    } catch (err) {
      setError(err.message || 'An error occurred while calling the AI service.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!activeTopic) return;
    
    // Create an explanation snippet to context-guide the quiz
    const snippet = `Concept: ${activeTopic.topic}\nELI5: ${activeTopic.explanations.eli5.substring(0, 400)}`;

    setQuizLoading(true);
    setError(null);

    try {
      const quizQuestions = await getQuiz({
        concept: activeTopic.topic,
        explanationSnippet: snippet,
        apiKey,
        model,
        customBaseUrl
      });

      // Update history list with generated quiz
      setHistory(prev => prev.map(item => {
        if (item.id === activeTopic.id) {
          return { ...item, quizzes: quizQuestions };
        }
        return item;
      }));

      // Initialize quiz execution states
      setCurrentQuestionIdx(0);
      setSelectedOptionIdx(null);
      setQuizAnswers([]);
      setQuizCompleted(false);
    } catch (err) {
      setError(`Failed to generate quiz: ${err.message}`);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleGenerateStudyPlan = async (e) => {
    e.preventDefault();
    if (!activeTopic) return;

    setPlanLoading(true);
    setError(null);

    try {
      const plan = await getStudyPlan({
        concept: activeTopic.topic,
        goals: studyGoals,
        timeCommitment: studyTime,
        apiKey,
        model,
        customBaseUrl
      });

      // Map timeline tasks with completion check state
      if (plan.timeline) {
        plan.timeline = plan.timeline.map((phase, pIdx) => ({
          ...phase,
          id: `phase-${pIdx}`,
          tasks: (phase.tasks || []).map((taskText, tIdx) => ({
            id: `task-${pIdx}-${tIdx}`,
            text: taskText,
            completed: false
          }))
        }));
      }

      setHistory(prev => prev.map(item => {
        if (item.id === activeTopic.id) {
          return { ...item, studyPlan: plan };
        }
        return item;
      }));
    } catch (err) {
      setError(`Failed to create study plan: ${err.message}`);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSelectOption = (optIdx) => {
    if (selectedOptionIdx !== null) return; // already answered
    setSelectedOptionIdx(optIdx);

    const question = activeTopic.quizzes[currentQuestionIdx];
    const isCorrect = optIdx === question.correctAnswer;

    setQuizAnswers(prev => [...prev, {
      questionIdx: currentQuestionIdx,
      selectedIdx: optIdx,
      isCorrect
    }]);
  };

  const handleNextQuestion = () => {
    setSelectedOptionIdx(null);
    if (currentQuestionIdx + 1 < activeTopic.quizzes.length) {
      setCurrentQuestionIdx(prev => prev + 1);
    } else {
      // Completed the quiz! Calculate score
      const correctCount = quizAnswers.filter(ans => ans.isCorrect).length;
      
      // Update overall user stats
      setStats(prev => {
        const nextTaken = prev.quizzesTaken + 1;
        const nextTotal = prev.totalScores + correctCount;
        return {
          quizzesTaken: nextTaken,
          totalScores: nextTotal,
          avgScore: Math.round((nextTotal / (nextTaken * 5)) * 100)
        };
      });

      setQuizCompleted(true);
    }
  };

  const handleToggleTask = (phaseId, taskId) => {
    if (!activeTopic || !activeTopic.studyPlan) return;

    const updatedTimeline = activeTopic.studyPlan.timeline.map(phase => {
      if (phase.id === phaseId) {
        return {
          ...phase,
          tasks: phase.tasks.map(task => {
            if (task.id === taskId) {
              return { ...task, completed: !task.completed };
            }
            return task;
          })
        };
      }
      return phase;
    });

    setHistory(prev => prev.map(item => {
      if (item.id === activeTopic.id) {
        return {
          ...item,
          studyPlan: {
            ...item.studyPlan,
            timeline: updatedTimeline
          }
        };
      }
      return item;
    }));
  };

  const handleDeleteHistory = (id, e) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    if (currentTopicId === id) {
      setCurrentTopicId(null);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('ai_tutor_api_key', apiKey);
    localStorage.setItem('ai_tutor_model', model);
    localStorage.setItem('ai_tutor_custom_url', customBaseUrl);
    setShowSettings(false);
  };

  const startRetakeQuiz = () => {
    setCurrentQuestionIdx(0);
    setSelectedOptionIdx(null);
    setQuizAnswers([]);
    setQuizCompleted(false);
  };

  const quickStartTags = ['React Hooks', 'Quantum Physics', 'Machine Learning', 'French Revolution'];

  return (
    <div className="app-container">
      {/* --- Sidebar Section --- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-logo">L</div>
          <span className="app-title">Luminos</span>
        </div>

        <button 
          onClick={() => { setCurrentTopicId(null); setError(null); }} 
          className="new-topic-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Concept
        </button>

        <div className="history-section">
          <div className="section-label">Learning History</div>
          {history.length === 0 ? (
            <div style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No history yet. Search for a concept above to begin.
            </div>
          ) : (
            <div className="history-list">
              {history.map(item => (
                <div 
                  key={item.id} 
                  className={`history-item ${item.id === currentTopicId ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentTopicId(item.id);
                    setActiveTab('explain');
                    setError(null);
                  }}
                >
                  <span className="history-item-text" title={item.topic}>{item.topic}</span>
                  <button 
                    onClick={(e) => handleDeleteHistory(item.id, e)} 
                    className="delete-history-btn"
                    title="Delete item"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button 
            onClick={() => setShowSettings(true)} 
            className={`footer-btn ${showSettings ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Tutor Configuration
          </button>
        </div>
      </aside>

      {/* --- Main Workspace Section --- */}
      <main className="main-workspace">
        <header className="workspace-header">
          <div>
            {!apiKey && (
              <span style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                OpenAI API Key Missing
              </span>
            )}
          </div>
          
          <div className="workspace-stats">
            <div className="stat-item">
              <span className="stat-val">{history.length}</span>
              <span className="stat-label">Topics</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">{stats.quizzesTaken}</span>
              <span className="stat-label">Quizzes</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">{stats.quizzesTaken > 0 ? `${stats.avgScore}%` : '—'}</span>
              <span className="stat-label">Avg Score</span>
            </div>
          </div>
        </header>

        <div className="workspace-content">
          {error && (
            <div style={{
              background: 'var(--error-glow)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--border-radius-md)',
              padding: '16px 20px',
              marginBottom: '24px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div style={{ flex: 1 }}>{error}</div>
              <button 
                onClick={() => setError(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                &times;
              </button>
            </div>
          )}

          {/* --- Loading Panel --- */}
          {loading ? (
            <div className="explanation-card animate-fade-in stagger-1" style={{ opacity: 0.85 }}>
              <div className="skeleton-loader">
                <div className="skeleton-line header"></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
                <div style={{ height: '12px' }}></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
              <div style={{ marginTop: '28px', textAlign: 'center' }}>
                <div className="loading-text" style={{ fontWeight: 500 }}>{loadingMessage}</div>
                <div className="loading-subtext" style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                  Please hold on while we structure your customized explanation.
                </div>
              </div>
            </div>
          ) : !activeTopic ? (
            /* --- Welcome Panel (Zero State) --- */
            <div className="welcome-panel animate-fade-in">
              <div className="welcome-logo-glow">L</div>
              <h1 className="welcome-title">Understand Anything</h1>
              <p className="welcome-subtitle">
                Enter any concept or question. <strong>Luminos</strong> breaks it down into four adaptable explanation styles instantly.
              </p>

              <div className="search-container">
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="E.g., CSS Flexbox, Theory of Relativity, Async/Await..."
                    className="search-input"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearch();
                    }}
                    disabled={loading}
                  />
                  <button onClick={() => handleSearch()} className="search-btn" disabled={loading}>
                    {loading ? (
                      <span className="button-spinner"></span>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                    )}
                    {loading ? 'Thinking...' : 'Explain'}
                  </button>
                </div>
              </div>

              <div className="quick-topics">
                {quickStartTags.map(tag => (
                  <button 
                    key={tag} 
                    className="quick-topic-tag"
                    onClick={() => handleSearch(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* --- Active Learning Workspace --- */
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="topic-header animate-fade-in stagger-1">
                <div className="topic-header-left">
                  <div className="topic-badge">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                  </div>
                  <h1 className="topic-title">{activeTopic.topic}</h1>
                </div>
                <div className="topic-header-right">
                  <span>Created {activeTopic.timestamp}</span>
                </div>
              </div>

              {/* Tab Navigation */}
              <nav className="pill-tab-bar stagger-2">
                <button 
                  className={`pill-tab-btn ${activeTab === 'explain' ? 'active' : ''}`}
                  onClick={() => setActiveTab('explain')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  Explanations
                </button>
                <button 
                  className={`pill-tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('quiz');
                    // Reset quiz options if already took it
                    if (activeTopic.quizzes && !quizCompleted) {
                      setCurrentQuestionIdx(0);
                      setSelectedOptionIdx(null);
                      setQuizAnswers([]);
                    }
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Quiz Generator
                </button>
                <button 
                  className={`pill-tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                  onClick={() => setActiveTab('plan')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Study Plan
                </button>
              </nav>

              {/* --- TAB: Explanations --- */}
              {activeTab === 'explain' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="segmented-control stagger-3">
                    <button 
                      className={`segmented-btn ${explanationStyle === 'eli5' ? 'active' : ''}`}
                      onClick={() => setExplanationStyle('eli5')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      ELI5
                    </button>
                    <button 
                      className={`segmented-btn ${explanationStyle === 'professional' ? 'active' : ''}`}
                      onClick={() => setExplanationStyle('professional')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      Professional
                    </button>
                    <button 
                      className={`segmented-btn ${explanationStyle === 'step_by_step' ? 'active' : ''}`}
                      onClick={() => setExplanationStyle('step_by_step')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      Step-by-Step
                    </button>
                    <button 
                      className={`segmented-btn ${explanationStyle === 'examples' ? 'active' : ''}`}
                      onClick={() => setExplanationStyle('examples')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                      Examples
                    </button>
                  </div>

                  {(!activeTopic.explanations[explanationStyle] || activeTopic.explanations[explanationStyle].startsWith('No ')) ? (
                    <div key={`empty-${explanationStyle}`} className="empty-state-card stagger-4">
                      <div className="empty-state-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </div>
                      <h4 className="empty-state-title">Explanation Unavailable</h4>
                      <p className="empty-state-subtitle">
                        We don't have a cached explanation for the "{explanationStyle}" style. Click below to generate it.
                      </p>
                      <button onClick={() => handleSearch(activeTopic.topic)} className="btn-generate">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Generate Explanation
                      </button>
                    </div>
                  ) : (
                    <div key={explanationStyle} className="explanation-card stagger-4">
                      {renderMarkdown(activeTopic.explanations[explanationStyle])}
                    </div>
                  )}

                  {activeTopic.followUps && activeTopic.followUps.length > 0 && (
                    <div className="follow-ups-section stagger-4">
                      <div className="section-header-divider">
                        <span className="section-header-text">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                          Deepen Your Understanding
                        </span>
                        <div className="section-header-line"></div>
                      </div>
                      <div className="follow-ups-list">
                        {activeTopic.followUps.map((q, idx) => (
                          <button 
                            key={idx} 
                            className="follow-up-bubble"
                            onClick={() => handleSearch(q)}
                          >
                            <span>{q}</span>
                            <span className="follow-up-arrow">&rarr;</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- TAB: Quiz Generator --- */}
              {activeTab === 'quiz' && (
                <div className="quiz-wrapper">
                  {quizLoading ? (
                    <div className="quiz-question-card animate-fade-in stagger-3" style={{ opacity: 0.85 }}>
                      <div className="skeleton-loader">
                        <div className="skeleton-line header"></div>
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line short"></div>
                        <div style={{ height: '10px' }}></div>
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line"></div>
                      </div>
                      <div style={{ marginTop: '24px', textAlign: 'center' }}>
                        <div className="loading-text" style={{ fontWeight: 500 }}>Creating customized quiz questions...</div>
                        <div className="loading-subtext" style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                          Designing tests based on your learning topic history.
                        </div>
                      </div>
                    </div>
                  ) : !activeTopic.quizzes ? (
                    <div className="quiz-intro-card">
                      <div className="quiz-icon">📝</div>
                      <h3 className="quiz-title">Test Your Understanding</h3>
                      <p className="quiz-desc">
                        Generate an interactive 5-question multiple choice quiz on <strong>{activeTopic.topic}</strong> to measure your retention of the concept.
                      </p>
                      <button onClick={handleGenerateQuiz} className="btn-generate">
                        Generate Quiz
                      </button>
                    </div>
                  ) : quizCompleted ? (
                    /* Score display panel */
                    <div className="quiz-score-card">
                      <div className="score-circle">
                        <span className="score-num">{quizAnswers.filter(ans => ans.isCorrect).length}</span>
                        <span className="score-total">/ 5</span>
                      </div>
                      
                      <div className="score-feedback">
                        {(() => {
                          const correctCount = quizAnswers.filter(ans => ans.isCorrect).length;
                          if (correctCount === 5) return 'Perfect Score! 🌟';
                          if (correctCount >= 3) return 'Great Job! 👍';
                          return 'Keep Practicing! 📚';
                        })()}
                      </div>
                      <p className="score-text">
                        You scored {quizAnswers.filter(ans => ans.isCorrect).length} out of 5 correct on "{activeTopic.topic}" quiz. Retake the quiz or read explanations again to build your understanding.
                      </p>

                      <div className="score-actions">
                        <button onClick={startRetakeQuiz} className="btn-generate">
                          Retake Quiz
                        </button>
                        <button onClick={() => setActiveTab('explain')} className="btn-secondary">
                          Review Explanations
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Active Quiz runner */
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="quiz-header">
                        <span className="question-counter">Question {currentQuestionIdx + 1} of 5</span>
                        <div className="quiz-progress-bar-bg">
                          <div 
                            className="quiz-progress-bar-fg" 
                            style={{ width: `${((currentQuestionIdx) / 5) * 100}%` }}
                          ></div>
                        </div>
                        <span className="question-counter">Score: {quizAnswers.filter(ans => ans.isCorrect).length}</span>
                      </div>

                      {activeTopic.quizzes[currentQuestionIdx] && (
                        <div className="quiz-question-card">
                          <div className="quiz-question-text">
                            {activeTopic.quizzes[currentQuestionIdx].question}
                          </div>

                          <div className="quiz-options-list">
                            {activeTopic.quizzes[currentQuestionIdx].options.map((opt, optIdx) => {
                              const isSelected = selectedOptionIdx === optIdx;
                              const isAnswered = selectedOptionIdx !== null;
                              const isCorrectAnswer = optIdx === activeTopic.quizzes[currentQuestionIdx].correctAnswer;
                              
                              let buttonClass = '';
                              if (isSelected) {
                                buttonClass = isCorrectAnswer ? 'correct' : 'wrong';
                              } else if (isAnswered && isCorrectAnswer) {
                                buttonClass = 'correct'; // highlight correct answer if wrong is chosen
                              }

                              return (
                                <button 
                                  key={optIdx} 
                                  className={`quiz-option-btn ${buttonClass}`}
                                  onClick={() => handleSelectOption(optIdx)}
                                  disabled={isAnswered}
                                >
                                  <span className="option-badge">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>

                          {selectedOptionIdx !== null && (
                            <div className="explanation-box">
                              <div className="explanation-box-title">
                                {selectedOptionIdx === activeTopic.quizzes[currentQuestionIdx].correctAnswer ? 'Correct Answer!' : 'Incorrect Answer'}
                              </div>
                              <div className="explanation-box-desc">
                                {activeTopic.quizzes[currentQuestionIdx].explanation}
                              </div>
                            </div>
                          )}

                          {selectedOptionIdx !== null && (
                            <div className="quiz-actions">
                              <button onClick={handleNextQuestion} className="btn-generate">
                                {currentQuestionIdx + 1 === 5 ? 'View Results' : 'Next Question'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* --- TAB: Study Plan --- */}
              {activeTab === 'plan' && (
                <div className="plan-wrapper">
                  {planLoading ? (
                    <div className="plan-form-card animate-fade-in stagger-3" style={{ opacity: 0.85 }}>
                      <div className="skeleton-loader">
                        <div className="skeleton-line header" style={{ width: '50%' }}></div>
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line short"></div>
                        <div style={{ height: '10px' }}></div>
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line short"></div>
                      </div>
                      <div style={{ marginTop: '24px', textAlign: 'center' }}>
                        <div className="loading-text" style={{ fontWeight: 500 }}>Structuring your learning schedule...</div>
                        <div className="loading-subtext" style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                          Personalizing study milestones based on your available time.
                        </div>
                      </div>
                    </div>
                  ) : !activeTopic.studyPlan ? (
                    <div className="plan-form-card">
                      <h3 className="quiz-title" style={{ marginBottom: '16px' }}>Generate a Study Plan</h3>
                      <form onSubmit={handleGenerateStudyPlan} className="plan-form">
                        <div className="form-group">
                          <label className="form-label">What is your learning goal?</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="E.g., build a simple calculator project, understand for a college exam..."
                            value={studyGoals}
                            onChange={(e) => setStudyGoals(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Available Study Time</label>
                          <select 
                            className="form-select"
                            value={studyTime}
                            onChange={(e) => setStudyTime(e.target.value)}
                          >
                            <option value="1 hour crash course">1 Hour (Crash Course)</option>
                            <option value="2 hours a week">2 Hours a week</option>
                            <option value="5 hours a week">5 Hours a week</option>
                            <option value="1 hour a day for 2 weeks">1 Hour a day (2 Weeks)</option>
                            <option value="flexible pace">Flexible / Pace Myself</option>
                          </select>
                        </div>

                        <button type="submit" className="btn-generate" style={{ marginTop: '8px', alignSelf: 'flex-start' }}>
                          Create Study Plan
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="plan-header-card">
                        <span className="plan-badge">Personalized Schedule</span>
                        <h2 className="quiz-title">{activeTopic.studyPlan.title}</h2>
                        <p className="plan-overview-text">{activeTopic.studyPlan.overview}</p>
                        
                        <button 
                          onClick={() => {
                            setHistory(prev => prev.map(item => {
                              if (item.id === activeTopic.id) {
                                return { ...item, studyPlan: null };
                              }
                              return item;
                            }));
                          }} 
                          className="btn-secondary"
                          style={{ marginTop: '16px', fontSize: '0.85rem', padding: '6px 16px' }}
                        >
                          Change Preferences
                        </button>
                      </div>

                      <div className="timeline-list">
                        {activeTopic.studyPlan.timeline.map((phase) => (
                          <div key={phase.id} className="timeline-node animate-fade-in">
                            <div className="timeline-dot"></div>
                            <div className="timeline-card">
                              <h3 className="timeline-phase-title">{phase.phase}</h3>
                              <div className="timeline-phase-focus">{phase.focus}</div>

                              {phase.tasks && phase.tasks.length > 0 && (
                                <div className="timeline-sub-section">
                                  <div className="timeline-section-title">Milestone Tasks</div>
                                  <div className="task-list-items">
                                    {phase.tasks.map((task) => (
                                      <label 
                                        key={task.id} 
                                        className={`task-item ${task.completed ? 'checked' : ''}`}
                                      >
                                        <input 
                                          type="checkbox" 
                                          className="task-checkbox" 
                                          checked={task.completed}
                                          onChange={() => handleToggleTask(phase.id, task.id)}
                                        />
                                        <span className="task-text">{task.text}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {phase.resources && phase.resources.length > 0 && (
                                <div className="timeline-sub-section">
                                  <div className="timeline-section-title">Recommended Approach</div>
                                  <div className="resource-list">
                                    {phase.resources.map((res, rIdx) => (
                                      <div key={rIdx} className="resource-item">
                                        <span className="resource-bullet"></span>
                                        <span>{res}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* --- Settings Modal --- */}
      {showSettings && (
        <div className="modal-backdrop">
          <div className="modal-content animate-fade-in">
            <div className="modal-header">
              <h3 className="modal-title">Tutor Configuration</h3>
              <button onClick={() => setShowSettings(false)} className="modal-close-btn">&times;</button>
            </div>

            <div className="settings-info-text">
              Configure your OpenAI API credentials. API keys are saved directly in your local browser storage and never sent elsewhere.
            </div>

            <div className="plan-form">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>OpenAI API Key</span>
                  <button 
                    type="button" 
                    onClick={() => setApiKeyVisible(!apiKeyVisible)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {apiKeyVisible ? 'Hide' : 'Reveal'}
                  </button>
                </label>
                <input 
                  type={apiKeyVisible ? 'text' : 'password'}
                  className="form-input"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Model Selection</label>
                <select 
                  className="form-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (Groq - Recommended Fast)</option>
                  <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Groq - Capable)</option>
                  <option value="mixtral-8x7b-32768">Mixtral 8x7B (Groq)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (OpenAI - Fast)</option>
                  <option value="gpt-4o">gpt-4o (OpenAI - Capable)</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo (OpenAI - Legacy)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Custom API Base URL (Optional)</label>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="https://api.groq.com/openai/v1 or https://api.openai.com/v1"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowSettings(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveSettings} className="btn-generate">
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
