// Configuration
const API_BASE_URL = 'http://127.0.0.1:11434/api';
const API_ENDPOINTS = {
  models: `${API_BASE_URL}/tags`,
  chat: `${API_BASE_URL}/chat`,
  generate: `${API_BASE_URL}/generate`
};

// DOM Elements
let elements = {};

// State management
const state = {
  isConnected: false,
  isGenerating: false,
  selectedModel: null
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM elements
  cacheElements();
  
  // Set up event listeners
  setupEventListeners();
  
  // Check connection and load models
  initializeApp();
});

// Cache DOM elements for better performance
function cacheElements() {
  elements = {
    statusIndicator: document.getElementById('status-indicator'),
    modelSelect: document.getElementById('modelSelect'),
    userInput: document.getElementById('userInput'),
    responseArea: document.getElementById('responseArea'),
    sendButton: document.getElementById('sendButton'),
    clearButton: document.getElementById('clearButton'),
    copyButton: document.getElementById('copyButton'),
    copyOptions: document.getElementById('copyOptions'),
    copyLastResponse: document.getElementById('copyLastResponse'),
    copyEntireChat: document.getElementById('copyEntireChat'),
    responseContainer: document.getElementById('response-container')
  };
}

// Set up event listeners
function setupEventListeners() {
  // Send prompt on Ctrl+Enter
  elements.userInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      sendToOllama();
    }
  });
  
  // Clear button functionality
  elements.clearButton.addEventListener('click', clearAll);
  
  // Send button functionality
  elements.sendButton.addEventListener('click', sendToOllama);
  
  // Copy button functionality
  elements.copyButton.addEventListener('click', showCopyOptions);
  elements.copyLastResponse.addEventListener('click', () => copyContent('last'));
  elements.copyEntireChat.addEventListener('click', () => copyContent('all'));
  
  // Close copy options when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.matches('#copyButton') && !e.target.closest('#copyOptions')) {
      elements.copyOptions.style.display = 'none';
    }
  });
}

// Initialize the application
async function initializeApp() {
  updateUIState('connecting');
  const connected = await checkOllamaConnection();
  updateUIState(connected ? 'connected' : 'disconnected');
}

// Update UI based on connection state
function updateUIState(connectionState) {
  switch(connectionState) {
    case 'connecting':
      elements.statusIndicator.textContent = 'Connecting to Ollama...';
      elements.statusIndicator.className = 'status-indicator';
      elements.sendButton.disabled = true;
      break;
      
    case 'connected':
      elements.statusIndicator.textContent = 'Connected to Ollama';
      elements.statusIndicator.className = 'status-indicator connected';
      elements.sendButton.disabled = false;
      state.isConnected = true;
      break;
      
    case 'disconnected':
      elements.statusIndicator.textContent = 'Disconnected from Ollama';
      elements.statusIndicator.className = 'status-indicator disconnected';
      elements.sendButton.disabled = false; // Enable to allow retry
      state.isConnected = false;
      
      // Show helpful error message
      elements.responseArea.innerHTML = 
        `<p style="color: red;">Error: Cannot connect to Ollama API</p>
         <p>Please check:</p>
         <ul>
           <li>Is Ollama installed? <a href="https://ollama.ai/download" target="_blank">Download here</a></li>
           <li>Is the Ollama service running?</li>
           <li>Is it running on the default port (11434)?</li>
         </ul>`;
      break;
      
    case 'generating':
      elements.sendButton.disabled = true;
      elements.sendButton.textContent = 'Generating...';
      elements.responseArea.innerHTML = '<p>Generating response... <span class="loading-spinner">⟳</span></p>';
      state.isGenerating = true;
      break;
      
    case 'idle':
      elements.sendButton.disabled = false;
      elements.sendButton.textContent = 'Send';
      state.isGenerating = false;
      break;
  }
}

// Check if Ollama API is reachable and populate model list
async function checkOllamaConnection() {
  try {
    const models = await fetchModels();
    populateModelDropdown(models);
    return true;
  } catch (error) {
    console.error('Error connecting to Ollama API:', error);
    addDefaultModel();
    return false;
  }
}

// Fetch available models from Ollama API
async function fetchModels() {
  try {
    const response = await fetch(API_ENDPOINTS.models);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Ollama API connection successful:', data);
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch models:', error);
    throw error;
  }
}

// Add a default model when API is not available
function addDefaultModel() {
  elements.modelSelect.innerHTML = '<option value="llama2">llama2</option>';
}

// Populate the model dropdown with available models
function populateModelDropdown(models) {
  // Clear existing options
  elements.modelSelect.innerHTML = '';
  
  if (models && models.length > 0) {
    // Add each model to the dropdown
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.name;
      elements.modelSelect.appendChild(option);
    });
  } else {
    // If no models are available, add a default option
    addDefaultModel();
    console.warn('No models found in Ollama API response');
  }
}

// Function to clear all inputs and responses
function clearAll() {
  // Clear the textarea
  elements.userInput.value = '';
  
  // Reset the response area
  elements.responseArea.innerHTML = '<p>Response will appear here...</p>';
  
  // Focus on the textarea
  elements.userInput.focus();
  
  console.log('All inputs and responses cleared');
}

// Function to send user input to Ollama
async function sendToOllama() {
  const userInput = elements.userInput.value.trim();
  const selectedModel = elements.modelSelect.value;
  
  if (!userInput) {
    showError('Please enter a prompt before sending.', 'warning');
    return;
  }
  
  if (!state.isConnected) {
    const reconnected = await checkOllamaConnection();
    if (!reconnected) {
      showError('Cannot connect to Ollama. Please make sure Ollama is running.');
      return;
    }
  }
  
  // Clear input immediately after sending
  elements.userInput.value = '';
  
  // Update UI to generating state
  updateUIState('generating');
  
  // Add user's message to response area
  const userMessage = document.createElement('div');
  userMessage.className = 'user-message';
  userMessage.textContent = `You: ${userInput}`;
  elements.responseArea.appendChild(userMessage);
  
  // Scroll to the bottom
  elements.responseArea.scrollTop = elements.responseArea.scrollHeight;
  
  // Prepare the request body
  const requestBody = {
    model: selectedModel,
    prompt: userInput,
    stream: true
  };
  
  try {
    await streamResponse(requestBody);
  } catch (error) {
    handleGenerationError(error);
  } finally {
    // Reset UI state
    updateUIState('idle');
    // Ensure we're scrolled to the bottom
    elements.responseArea.scrollTop = elements.responseArea.scrollHeight;
  }
}

// Stream the response from Ollama API
async function streamResponse(requestBody) {
  let fullResponse = '';
  
  try {
    const response = await fetch(API_ENDPOINTS.generate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    // Create response element
    const responseElement = document.createElement('div');
    responseElement.className = 'assistant-message';
    responseElement.innerHTML = 'Assistant: ';
    elements.responseArea.appendChild(responseElement);
    
    // Scroll to show the new response
    elements.responseArea.scrollTop = elements.responseArea.scrollHeight;
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('Stream complete');
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const jsonResponse = JSON.parse(line);
          
          if (jsonResponse.response) {
            fullResponse += jsonResponse.response;
            responseElement.textContent = 'Assistant: ' + fullResponse;
            // Keep scrolling to bottom as new content arrives
            elements.responseArea.scrollTop = elements.responseArea.scrollHeight;
          }
        } catch (e) {
          console.error('Error parsing JSON from stream:', e, line);
        }
      }
    }
  } catch (error) {
    throw error;
  }
}

// Handle errors during generation
function handleGenerationError(error) {
  console.error('Error generating response:', error);
  
  let errorMessage = 'An error occurred while generating the response.';
  let errorDetails = '';
  
  // Provide more specific error messages based on the error
  if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
    errorMessage = 'Network error: Could not connect to Ollama API.';
    errorDetails = 'Make sure Ollama is running and accessible.';
  } else if (error.message.includes('HTTP error')) {
    errorMessage = `Server error: ${error.message}`;
    errorDetails = 'The Ollama server returned an error. Check the server logs for more details.';
  } else if (error.message.includes('model not found')) {
    errorMessage = 'Model not found error.';
    errorDetails = `The selected model "${elements.modelSelect.value}" is not installed. Run "ollama pull ${elements.modelSelect.value}" to install it.`;
  }
  
  showError(errorMessage, 'error', errorDetails);
}

// Display error messages
function showError(message, type = 'error', details = '') {
  const color = type === 'error' ? 'red' : type === 'warning' ? 'orange' : 'blue';
  
  let errorHTML = `<p style="color: ${color};">${message}</p>`;
  if (details) {
    errorHTML += `<p>${details}</p>`;
  }
  
  elements.responseArea.innerHTML = errorHTML;
}

// Helper function to select a model from a list of preferences
function selectModelByPreference(modelPreferences) {
  // Get all available options
  const options = Array.from(elements.modelSelect.options).map(opt => opt.value.toLowerCase());
  
  // Try to find the first preferred model that's available
  for (const preferredModel of modelPreferences) {
    const matchingModel = options.find(opt => 
      opt.toLowerCase().includes(preferredModel.toLowerCase())
    );
    
    if (matchingModel) {
      elements.modelSelect.value = matchingModel;
      console.log(`Selected model: ${matchingModel}`);
      return true;
    }
  }
  
  // If no preferred model is found, keep the current selection
  console.log(`No preferred models found. Keeping current selection: ${elements.modelSelect.value}`);
  return false;
}

// Function to load task-specific applications
function loadTaskApp(appType) {
  console.log(`Loading ${appType} application`);
  
  // Set appropriate model and template prompt based on app type
  switch(appType) {
    case 'summarizer':
      selectModelByPreference(['llama2', 'mistral']);
      elements.userInput.value = "Please summarize the following text:\n\n[Paste your text here]";
      console.log('Text Summarizer app loaded');
      break;
      
    case 'codeGenerator':
      selectModelByPreference(['codellama', 'llama2']);
      elements.userInput.value = "Generate code for the following requirement:\n\n[Describe what you need]";
      console.log('Code Generator app loaded');
      break;
      
    case 'questionAnswering':
      selectModelByPreference(['llama2', 'mistral']);
      elements.userInput.value = "Please answer the following question:\n\n[Your question here]";
      console.log('Question Answering app loaded');
      break;
      
    case 'creativeWriter':
      selectModelByPreference(['llama2', 'mistral']);
      elements.userInput.value = "Write a creative story about:\n\n[Your topic here]";
      console.log('Creative Writer app loaded');
      break;
      
    case 'translator':
      selectModelByPreference(['llama2', 'mistral']);
      elements.userInput.value = "Translate the following text from [source language] to [target language]:\n\n[Text to translate]";
      console.log('Translator app loaded');
      break;
      
    case 'dataAnalyzer':
      selectModelByPreference(['llama2', 'mistral']);
      elements.userInput.value = "Analyze the following data and provide insights:\n\n[Paste your data here]";
      console.log('Data Analyzer app loaded');
      break;
      
    default:
      console.log('Unknown app type');
  }
  
  // Focus on the textarea for immediate editing
  elements.userInput.focus();
  
  // Select the template text for easy replacement
  const placeholderStart = elements.userInput.value.indexOf('[');
  const placeholderEnd = elements.userInput.value.lastIndexOf(']') + 1;
  
  if (placeholderStart !== -1 && placeholderEnd !== -1) {
    elements.userInput.setSelectionRange(placeholderStart, placeholderEnd);
  }
}

function showCopyOptions(event) {
  const button = event.target;
  const options = elements.copyOptions;
  const rect = button.getBoundingClientRect();
  
  options.style.display = 'block';
  options.style.top = `${rect.bottom + window.scrollY + 5}px`;
  options.style.left = `${rect.left + window.scrollX}px`;
}

function copyContent(type) {
  let textToCopy = '';
  const messages = elements.responseArea.children;
  
  if (type === 'last') {
    // Find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].textContent.startsWith('Assistant:')) {
        textToCopy = messages[i].textContent;
        break;
      }
    }
  } else if (type === 'all') {
    // Copy all messages
    textToCopy = Array.from(messages)
      .map(msg => msg.textContent)
      .filter(text => text !== 'Response will appear here...')
      .join('\n\n');
  }
  
  if (textToCopy) {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        elements.copyOptions.style.display = 'none';
        showCopySuccess();
      })
      .catch(err => {
        console.error('Failed to copy text:', err);
        showError('Failed to copy text', 'error');
      });
  }
}

function showCopySuccess() {
  const notification = document.createElement('div');
  notification.textContent = 'Copied to clipboard!';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 1000;
    animation: fadeOut 2s forwards;
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000);
}