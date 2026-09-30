You are building the ULTRON application and its integration with the ULTRON AI server.

ULTRON is a local-first, model-agnostic, agentic AI operating environment.

IMPORTANT ARCHITECTURE RULE:
We are going to build this specs over our existing app without breaking the flow we have now, so we will keep the current app flow and we will build the new architecture on top of it, so we can have a smooth transition to the new architecture.
The frontend/app is NOT the AI brain.
for this phase keep the brain existing gemini ai and others, for the automations and agents shoul be all cloud based for now 
The ULTRON SERVER owns:

* AI models
* agents
* planning
* tool execution
* memory
* browser automation
* Windows automation
* voice processing
* task execution
* scheduling
* system control

The app is primarily the user interface and remote control surface.

==================================================

1. APP STACK
   ==================================================

Use:

* Next.js
* React
* TypeScript
* Tailwind CSS
* PWA
* WebSocket
* REST API

The application must be responsive on:

* desktop
* laptop
* tablet
* phone

Use a dark futuristic ULTRON visual language:

* near-black background
* blue/violet/cyan accents
* glass panels
* subtle borders
* clean typography
* minimal futuristic effects
* professional rather than gimmicky

==================================================
2. APP STRUCTURE
================

Create:

app/
├── chat/
├── voice/
├── tasks/
├── agents/
├── projects/
├── memory/
├── models/
├── tools/
├── devices/
├── system/
├── logs/
└── settings/

components/
├── chat/
├── voice/
├── dashboard/
├── agents/
├── tasks/
├── system/
├── memory/
└── common/

lib/
├── api/
├── websocket/
├── auth/
├── state/
├── storage/
└── utils/

==================================================
3. MAIN APP FEATURES
====================

Implement:

CHAT

* streaming messages
* conversation history
* markdown
* code blocks
* tool activity
* task status
* agent status
* attachments
* stop/cancel generation

VOICE

* microphone control
* live transcript
* connection status
* speaking state
* interruption
* voice activity indicator

TASKS

* running tasks
* queued tasks
* completed tasks
* failed tasks
* task progress
* task cancellation

AGENTS

* active agents
* agent status
* current task
* tool usage
* execution history

MODELS

* local models
* cloud models
* active model
* model health
* local/cloud/offline mode

MEMORY

* memories
* projects
* searchable knowledge
* memory management

SYSTEM

* CPU
* RAM
* GPU
* VRAM
* disk
* network
* server health

TOOLS

* available tools
* permissions
* recent executions

LOGS

* system events
* agent events
* tool executions
* errors

==================================================
4. SERVER COMMUNICATION
=======================

Use REST for:

* authentication
* configuration
* history
* project data
* memory management
* task management

Use WebSocket for:

* streaming AI responses
* voice
* agent activity
* task progress
* tool execution events
* notifications
* system events

Do NOT poll aggressively.

Prefer event-driven updates.

==================================================
5. TOOL ARCHITECTURE
====================

Never allow an LLM to directly execute arbitrary operating-system commands.

All computer interaction must pass through:

LLM
→ Agent
→ Tool Router
→ Permission Manager
→ Tool
→ Executor
→ Verification
→ Result

Every tool must have:

* name
* description
* input schema
* output schema
* permission level
* executor
* validation
* logging

==================================================
6. BROWSER AUTOMATION
=====================

DO NOT implement a browser automation engine from scratch.

Use Playwright as the primary browser automation backend.

Create:

server/tools/browser/

Include:

browser_manager
browser_session
navigation
interaction
extraction
screenshots
downloads

Expose high-level tools such as:

browser.open
browser.navigate
browser.click
browser.type
browser.select
browser.read
browser.screenshot
browser.download
browser.close

The agent should use these abstractions instead of directly controlling Playwright.

==================================================
7. WINDOWS AUTOMATION
=====================

DO NOT implement Windows GUI automation from scratch.

Use existing automation technologies.

Primary options:

* pywinauto
* Windows UI Automation
* PowerShell
* Python
* PyAutoGUI as fallback

Create:

server/tools/windows/

Possible tools:

windows.launch_app
windows.close_app
windows.list_apps
windows.get_window
windows.focus_window
windows.inspect_ui
windows.keyboard
windows.mouse
windows.screenshot
windows.system_info

Prefer accessibility/UI automation over coordinate-based mouse automation.

Use PyAutoGUI only when deterministic UI automation is unavailable.

==================================================
8. COMPUTER CONTROL HIERARCHY
=============================

Use this order:

1. Application API
2. Browser DOM / Playwright
3. Windows UI Automation / pywinauto
4. Keyboard shortcuts
5. Mouse/keyboard automation
6. Vision-based interaction

Do NOT use computer vision if a reliable API or UI automation interface exists.

==================================================
9. VISION FALLBACK
==================

For applications where normal automation cannot identify controls:

Screenshot
→ Vision Model
→ UI Element Detection
→ Computer Tool
→ Action
→ Screenshot
→ Verification

Never blindly trust coordinate-based actions.

After important actions, verify the resulting UI state.

==================================================
10. SECURITY
============

Implement permission levels:

LEVEL 0
Read-only

LEVEL 1
Safe actions

LEVEL 2
Modify files

LEVEL 3
Execute programs

LEVEL 4
System configuration

LEVEL 5
Destructive / explicit approval required

The LLM must never bypass the permission system.

Every tool execution must be logged.

Log:

* timestamp
* user
* agent
* tool
* arguments
* permission level
* result
* success/failure
* verification result

==================================================
11. AGENT ARCHITECTURE
======================

Implement agents as modular services/classes.

Start with:

General Agent
Coding Agent
Research Agent
Browser Agent
Windows Agent
System Agent
Automation Agent
Vision Agent

Do NOT implement all agents at once.

First make the agent runtime stable.

Then implement one agent at a time.

==================================================
12. AGENT LIFECYCLE
===================

Every task should follow:

REQUEST
→ UNDERSTAND
→ PLAN
→ SELECT AGENT
→ SELECT MODEL
→ EXECUTE
→ OBSERVE
→ VERIFY
→ COMPLETE

If verification fails:

VERIFY
→ FAILURE
→ REPLAN
→ EXECUTE
→ VERIFY

Do not report success before verification.

==================================================
13. MODEL ROUTER
================

The app should not directly decide which model performs a task.

The server owns Model Router.

Possible modes:

LOCAL
HYBRID
CLOUD
OFFLINE

Routing factors:

* task type
* privacy
* latency
* cost
* model availability
* context size
* hardware capability

==================================================
14. VOICE
=========

Voice must eventually support:

Microphone
→ VAD
→ Wake Word
→ STT
→ ULTRON Core
→ Model
→ Agent
→ Streaming response
→ TTS
→ Speaker

Use:

* faster-whisper for local STT
* Piper for local TTS

Voice must support interruption:

USER SPEAKS
→ STOP CURRENT TTS
→ CANCEL/PAUSE CURRENT RESPONSE
→ LISTEN
→ PROCESS NEW REQUEST

==================================================
15. MEMORY
==========

Use:

PostgreSQL
+
pgvector
+
Redis

PostgreSQL:

* users
* projects
* tasks
* conversations
* configuration
* history

pgvector:

* semantic memory
* embeddings
* knowledge retrieval

Redis:

* cache
* sessions
* queues
* realtime state

==================================================
16. EVENT SYSTEM
================

Use an event-driven architecture.

Example events:

USER_MESSAGE
TASK_CREATED
TASK_STARTED
TASK_COMPLETED
TASK_FAILED
TOOL_STARTED
TOOL_COMPLETED
BUILD_FAILED
CPU_HIGH
GPU_HIGH
DISK_LOW
DEVICE_CONNECTED
DEVICE_OFFLINE
SCHEDULE_TRIGGERED

The frontend should receive relevant events through WebSocket.

==================================================
17. DEVELOPMENT RULES
=====================

Do not create unnecessary abstractions before they are needed.

Do not duplicate functionality.

Do not hardcode model names throughout the application.

Do not hardcode tool implementations into agents.

Use interfaces/adapters.

Keep:

UI
API
CORE
AGENTS
TOOLS
MODELS
MEMORY

separated.

Everything should be replaceable.

For example:

Playwright can later be replaced.

Ollama can later be replaced.

PostgreSQL can later be replaced.

A model provider must not leak into the rest of the application.

==================================================
18. IMPLEMENTATION ORDER
========================

Build in this order:

PHASE 1
App shell
Authentication
Navigation
Chat UI

PHASE 2
REST API
WebSocket
Streaming responses

PHASE 3
ULTRON Core
Conversation manager
Context
Model router

PHASE 4
Ollama integration

PHASE 5
Tool runtime
Permission manager
Tool logging

PHASE 6
Coding Agent

PHASE 7
Browser Agent + Playwright

PHASE 8
Windows Agent + pywinauto/UI Automation

PHASE 9
System Agent

PHASE 10
PostgreSQL + pgvector + Redis

PHASE 11
Voice

PHASE 12
Autonomous tasks

PHASE 13
Event bus + scheduler

PHASE 14
Vision/computer-use fallback

PHASE 15
ESP32 integration

==================================================
19. TESTING
===========

Every new subsystem must have tests.

Before declaring a feature complete:

* build
* lint
* typecheck
* unit tests
* integration tests where appropriate
* verify actual runtime behavior

Never claim a feature works only because the code compiles.

==================================================
20. IMPORTANT PRINCIPLE
=======================

Do not try to build a giant autonomous AI system in one step.

Build a small working ULTRON core first.

Then add:

TOOLS
→ AGENTS
→ MEMORY
→ VOICE
→ AUTOMATION
→ AUTONOMY
→ PHYSICAL DEVICES

Every layer must remain modular.

The final architecture should allow ULTRON to control browsers, Windows applications, files, development tools, APIs, system resources, and physical devices through controlled tools rather than unrestricted LLM access.
