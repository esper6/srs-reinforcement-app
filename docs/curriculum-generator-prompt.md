# Curriculum Generator Prompt

Copy everything below into Claude.ai, ChatGPT, or any LLM. Fill out the questionnaire at the top, then send. Paste the JSON output into MEMORY.dump's Import Curriculum page.

---

# FILL THIS OUT

**What topic do you want to learn?**
(e.g. "Kubernetes", "Music Theory", "Graph Algorithms", "How the Internet Works", "Organic Chemistry", "Personal Finance & Investing", "U.S. Constitutional Law", "Machine Learning Fundamentals", "Screenwriting Structure", "Poker Strategy & Game Theory", "Why My Code Works Locally But Not in Production", "Microprocessor Architecture", "Behavioral Psychology", "How to Sound Smart at Dinner Parties", "Astrophysics for Non-Physicists", "SQL & Database Design", "Why Printers Never Work")


**How deep should it go?**
(e.g. "beginner intro", "intermediate for someone with basic knowledge", "practitioner-level deep dive")


**Any specific areas you want covered?**
(Optional. e.g. "focus on security and networking", "skip the math, focus on intuition", "include real-world trade-offs")


**Any source material?**
(Optional. Paste URLs, article titles, book names, course syllabi, or notes. The AI will use these to inform the curriculum.)


---
# ⚠️ DO NOT EDIT BELOW THIS LINE ⚠️
# Everything below is instructions for the AI.
---

You are a curriculum designer for a Socratic learning app. The app works like this: an AI tutor conducts a conversation with a student about each concept — asking open-ended questions, probing their understanding, and scoring them on 3-5 "facets" (sub-topics) per concept. The AI's only reference material is the lesson markdown you write. There are no flashcards, no multiple choice — just conversation.

Your job: generate a complete curriculum as a single JSON object based on the questionnaire answers above.

## Output format

Output ONLY valid JSON. No commentary before or after. Keys are PascalCase. The output is a single object (not an array).

```json
{
  "Name": "Curriculum Name",
  "Slug": "curriculum-slug",
  "Description": "One-line description of the subject area",
  "Language": "",
  "IconClass": "",
  "Order": 1,
  "Sections": [
    {
      "Name": "Section Name",
      "Concepts": [
        {
          "Title": "Concept Title",
          "Description": "One-line concept description",
          "LessonMarkdown": "### Concept Title\n\nFull lesson content here...",
          "Order": 1,
          "Prompts": [],
          "Vocab": [
            {"Term": "key term", "Definition": "concise definition (1-2 sentences)"},
            {"Term": "another term", "Definition": "its meaning"}
          ]
        }
      ]
    }
  ]
}
```

## Curriculum structure rules

- **4-6 sections** per curriculum, ordered by logical progression (fundamentals first, advanced last)
- **5 concepts** per section
- **Slug**: lowercase, hyphens, URL-safe, unique (e.g. `graph-algorithms`)
- **Order**: sequential integers starting at 1 for both sections and concepts
- **Prompts**: always an empty array `[]`
- **Vocab**: array of 5-10 key terms per concept. Each has `"Term"` and `"Definition"`. Definitions should be concise (1-2 sentences), self-contained, and capture the core meaning. These are used for flashcard drills separate from the Socratic assessment.
- **Language** and **IconClass**: always empty strings `""`
- Sections should build on each other — earlier sections establish vocabulary that later sections assume
- No overlapping concepts within the same section — each concept owns its territory

## Lesson writing rules (CRITICAL)

The `LessonMarkdown` field is the most important part. The AI tutor uses it as its ONLY reference when assessing students. A bad lesson produces a bad assessment.

### Structure

Each lesson MUST have **3-5 clearly delineated sections**, each one mapping to a distinct assessable facet. Use `####` subheadings to separate them.

For each facet section, cover **four levels of depth**:
1. **What** — Define it clearly
2. **Why** — Why does it matter? What problem does it solve?
3. **How** — How does it actually work? What's the mechanism?
4. **When** — When should you use it vs. alternatives? What are the trade-offs?

These four levels let the AI probe at different depths. A student who knows the "what" but not the "why" scores ~25-40% on that facet. A student who can discuss trade-offs scores 80-100%.

### Style

- **Length**: 800-1500 words per lesson
- **Tone**: Clear, direct, slightly conversational. Not textbook-dry, not overly casual
- Write **narrative**, not bullet-point glossaries. The AI needs connective tissue to have a real conversation
- Use **concrete examples** and analogies
- Use **contrast**: "X is like Y, but differs because Z"
- Connect ideas: "This matters because...", "The trade-off is...", "In practice..."

### What NOT to do

- Do NOT write lists of definitions — the AI can only quiz recall, not understanding
- Do NOT make facets overlap with other concepts in the same section
- Do NOT write concepts so narrow they have only 1-2 facets (merge them into a bigger concept)
- Do NOT write concepts so broad they need 8+ facets (split them)
- Do NOT include code examples longer than 5 lines — keep it conceptual

### The scoping test

For each concept, ask: "Could a tutor have a meaningful 10-minute conversation assessing this?" If the answer is no (too narrow or too broad), rescope it.

## Example: BAD lesson (don't do this)

```markdown
### HTTP and REST APIs

**HTTP** is the language clients and servers speak. Every request has a **method**, a **URL**, **headers**, and optionally a **body**.

The four most important HTTP methods:
- **GET** — Retrieve data
- **POST** — Create a new resource
- **PUT** — Update an existing resource
- **DELETE** — Remove a resource

**Status codes:**
- **2xx** — Success
- **4xx** — Client error
- **5xx** — Server error

**REST** is a set of conventions built on HTTP:
- Resources are identified by URLs
- Use HTTP methods to express intent
- Responses are typically JSON
- The server is stateless
```

**Why it's bad:** All lists, no narrative. No "why" or "when." No trade-offs. A student who memorizes this list scores 90% without understanding anything. The AI can't have a Socratic conversation about a glossary.

## Example: GOOD lesson (do this)

```markdown
### HTTP and REST APIs

When your browser fetches a webpage or your app talks to a backend, HTTP is the protocol carrying that conversation. Every HTTP exchange follows the same shape: the client sends a **request** (method + URL + headers + optional body), the server sends back a **response** (status code + headers + body). Understanding this shape is the foundation — everything else builds on it.

#### The Request-Response Model

HTTP is fundamentally **stateless** — each request is independent. The server doesn't remember your previous request. This sounds limiting, but it's actually a powerful design choice: any server in a cluster can handle any request, which makes horizontal scaling straightforward. The trade-off is that the client (or a session layer on top) must carry state — via cookies, tokens, or URL parameters.

Think about what happens when you submit a login form. The browser sends a POST with your credentials. The server validates them and sends back a cookie. From that point on, your browser attaches that cookie to every subsequent request. HTTP itself is still stateless — it's the cookie mechanism layered on top that creates the illusion of a session.

#### Methods and Their Semantics

The four core HTTP methods aren't just labels — they carry semantic promises. GET promises to be **safe** (no side effects) and **idempotent** (calling it 10 times has the same effect as calling it once). PUT is idempotent but not safe — it modifies data, but sending the same PUT twice produces the same result. POST is neither safe nor idempotent — each call may create a new resource.

Why does this matter? Caches, proxies, and retry logic all depend on these guarantees. A browser will freely retry a failed GET but will warn you before resubmitting a POST. An API gateway might cache GET responses but never POST responses. When you violate these semantics (like using GET to delete something), you break the assumptions the entire HTTP ecosystem relies on.

#### Status Codes as Communication

Status codes aren't just error numbers — they're a communication protocol between server and client. A 201 tells the client "I created the thing, here's where to find it" (via the Location header). A 304 says "nothing changed since you last asked, use your cached copy." A 429 says "slow down, you're hitting rate limits."

The distinction between 4xx and 5xx is critical for debugging and monitoring: 4xx means the client did something wrong (fix the request), 5xx means the server broke (page the oncall). Confusing these — like returning 500 for invalid user input — makes your API harder to debug and your error rates misleading.

#### REST as a Design Philosophy

REST isn't a spec — it's a set of constraints that, when followed together, produce APIs that are predictable and cacheable. The core idea: resources (nouns) are identified by URLs, and you use HTTP methods (verbs) to operate on them. `/api/users/42` is the resource; GET reads it, PUT updates it, DELETE removes it.

The trap many teams fall into is "REST-ish" APIs that look RESTful on the surface but violate the constraints. Using POST for everything, embedding actions in URLs (`/api/users/42/activate`), or returning different shapes for the same resource depending on the endpoint — these patterns create APIs that require documentation to use, rather than being self-describing.
```

**Why it's good:** Each section is a distinct facet. Each has definition + motivation + mechanism + judgment. The AI can probe at multiple levels — "What makes GET different from POST?" tests surface knowledge, "Why would caching break if you use GET for deletes?" tests deep understanding.

## Now generate the curriculum

Generate the full curriculum JSON for the topic above. Remember:
- 4-6 sections, 5 concepts each
- Every lesson 800-1500 words with 3-5 facet sections
- 5-10 vocab terms per concept with concise definitions
- Narrative style, not bullet lists
- Output ONLY the JSON, nothing else
