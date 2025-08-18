import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Inline completion provider
    const provider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, {
        async provideInlineCompletionItems(document, position, _context, _token) {
            const config = vscode.workspace.getConfiguration('gcpal');
            const apiKey = config.get<string>('apiKey');
            const providerName = config.get<string>('provider') || 'openrouter';
            const model = config.get<string>('model') || 'mistralai/mistral-7b-instruct';
            if (!apiKey) {
                return { items: [] };
            }

            // Gather a few lines of context above the cursor
            const maxLines = 20;
            const startLine = Math.max(0, position.line - maxLines);
            let snippet = '';
            for (let i = startLine; i <= position.line; i++) {
                snippet += document.lineAt(i).text + '\n';
            }

            const systemPrompt = 'You are an AI coding assistant. Complete the user\'s code based on the provided context. Only output the code continuation without explanations.';
            const userPrompt = `Context:\n${snippet}\nCompletion:`;

            try {
                const completion = await callLLM(apiKey, providerName, model, systemPrompt, userPrompt);
                if (completion) {
                    return {
                        items: [
                            {
                                insertText: completion.trim(),
                                range: new vscode.Range(position, position)
                            }
                        ]
                    };
                }
            } catch (err) {
                console.error(err);
            }
            return { items: [] };
        }
    });
    context.subscriptions.push(provider);

    // Chat command
    const askCommand = vscode.commands.registerCommand('gcpal.ask', async () => {
        const question = await vscode.window.showInputBox({ prompt: 'Ask GCpal' });
        if (!question) {
            return;
        }
        const config = vscode.workspace.getConfiguration('gcpal');
        const apiKey = config.get<string>('apiKey');
        const providerName = config.get<string>('provider') || 'openrouter';
        const model = config.get<string>('model') || 'mistralai/mistral-7b-instruct';
        if (!apiKey) {
            vscode.window.showErrorMessage('Please set gcpal.apiKey in settings.');
            return;
        }
        const systemPrompt = 'You are a helpful coding assistant.';
        try {
            const answer = await callLLM(apiKey, providerName, model, systemPrompt, question);
            vscode.window.showInformationMessage(answer);
        } catch (err) {
            vscode.window.showErrorMessage(`Error: ${err}`);
        }
    });
    context.subscriptions.push(askCommand);
}

async function callLLM(apiKey: string, provider: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    let url: string;
    const providerLower = provider.toLowerCase();
    if (providerLower === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
    } else if (providerLower === 'together') {
        url = 'https://api.together.xyz/v1/chat/completions';
    } else {
        // If provider is a full URL, use it as endpoint
        url = provider;
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (providerLower === 'openrouter' || providerLower.includes('openrouter')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'github.com/developer-mohanaditya/gcpal';
        headers['X-Title'] = 'GCpal';
    } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        stream: false
    };

    // Use fetch from the global scope (available in Node 18+ / VS Code)
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data?.choices?.length) {
        return data.choices[0].message?.content || '';
    }
    return '';
}

export function deactivate() {}
