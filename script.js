// Configuration
const API_BASE_URL = 'http://127.0.0.1:11434/api';
const API_ENDPOINTS = {
  models: `${API_BASE_URL}/tags`,
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
  const userInput = elements.userInput.value;
  const selectedModel = elements.modelSelect.value;
  
  // Log the input and selected model to console
  console.log('User Input:', userInput);
  console.log('Selected Model:', selectedModel);
  
  // Check if input is empty
  if (!userInput.trim()) {
    showError('Please enter a prompt before sending.', 'warning');
    return;
  }
  
  // Check if connected to Ollama
  if (!state.isConnected) {
    // Try to reconnect
    const reconnected = await checkOllamaConnection();
    if (!reconnected) {
      showError('Cannot connect to Ollama. Please make sure Ollama is running.', 'error');
      return;
    }
  }
  
  // Update UI to generating state
  updateUIState('generating');
  
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
  }
}

// Stream the response from Ollama API
async function streamResponse(requestBody) {
  // Send POST request to Ollama API
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
  
  // Prepare for streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  
  // Clear the response area before streaming
  elements.responseArea.innerHTML = '<div class="streaming-response"></div>';
  const streamingElement = elements.responseArea.querySelector('.streaming-response');
  
  // Process the stream
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      console.log('Stream complete');
      break;
    }
    
    // Decode the chunk
    const chunk = decoder.decode(value, { stream: true });
    
    // Process each line in the chunk (each line is a JSON object)
    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const jsonResponse = JSON.parse(line);
        
        // Extract the response text
        if (jsonResponse.response) {
          fullResponse += jsonResponse.response;
          streamingElement.textContent = fullResponse;
        }
        
        // If this is the final response, we can add additional info
        if (jsonResponse.done) {
          console.log('Generation complete:', jsonResponse);
        }
      } catch (e) {
        console.error('Error parsing JSON from stream:', e, line);
      }
    }
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