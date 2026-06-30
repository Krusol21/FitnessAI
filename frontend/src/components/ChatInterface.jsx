import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import client from '../api/client';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    client.get('/agent/history')
      .then(r => setMessages(r.data))
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const { data } = await client.post('/agent/chat', { message: text });
      setMessages(m => [...m, { role: 'assistant', content: data.message }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    'Build me a new workout plan',
    "What's my nutrition today?",
    'My bench press is lagging — help',
    "How are my PRs looking?",
  ];

  return (
    <div className="md:ml-52 flex flex-col h-[calc(100dvh-4rem)] md:h-dvh">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Coach AI</h2>
        <p className="text-xs text-gray-500">Your personal trainer — asks questions, logs everything</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {initializing ? (
          <div className="text-center text-gray-500 text-sm mt-8">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div className="text-center mt-8">
            <p className="text-gray-400 mb-6">Hey! I'm your AI coach. What do you want to work on today?</p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2.5 rounded-xl text-left transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm prose prose-sm prose-invert max-w-none'
                }`}
              >
                {m.role === 'user' ? m.content : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-200">{children}</li>,
                      strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                      h3: ({ children }) => <p className="font-semibold text-white mt-2 mb-1">{children}</p>,
                      h4: ({ children }) => <p className="font-medium text-gray-200 mt-1.5 mb-0.5">{children}</p>,
                      code: ({ children }) => <code className="bg-gray-700 px-1 py-0.5 rounded text-xs">{children}</code>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="border-t border-gray-800 px-4 py-3 flex gap-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Message your coach…"
          disabled={loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
