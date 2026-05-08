import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

// Kill switch
if (process.env.BLOG_GENERATION_ENABLED !== 'true') {
  console.log('Blog generation is disabled. Set BLOG_GENERATION_ENABLED=true to enable.')
  process.exit(0)
}

const TOPICS_FILE = path.join(process.cwd(), 'data/topics.json')
const USED_FILE = path.join(process.cwd(), 'data/topics-used.json')
const POSTS_DIR = path.join(process.cwd(), 'content/blog')

interface Topic {
  id: number
  title: string
  keywords: string[]
  category: string
}

// Get next unused topic
function getNextTopic(): Topic | null {
  const topics: Topic[] = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'))
  const used: number[] = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'))
  const remaining = topics.filter(t => !used.includes(t.id))

  if (remaining.length === 0) {
    console.error('ERROR: All topics have been used! Add more to data/topics.json.')
    return null
  }

  if (remaining.length < 14) {
    console.warn(`WARNING: Only ${remaining.length} topics remaining. Add more soon.`)
  }

  return remaining[0]
}

function markTopicUsed(id: number): void {
  const used: number[] = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'))
  used.push(id)
  fs.writeFileSync(USED_FILE, JSON.stringify(used, null, 2))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function validatePost(content: string, keywords: string[]): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  // Check word count (800-1200)
  const wordCount = content.split(/\s+/).length
  if (wordCount < 700) issues.push(`Too short: ${wordCount} words (min 700)`)
  if (wordCount > 1500) issues.push(`Too long: ${wordCount} words (max 1500)`)

  // Check frontmatter
  if (!content.startsWith('---')) issues.push('Missing frontmatter')
  if (!content.includes('title:')) issues.push('Missing title in frontmatter')
  if (!content.includes('description:')) issues.push('Missing description in frontmatter')
  if (!content.includes('keywords:')) issues.push('Missing keywords in frontmatter')
  if (!content.includes('category:')) issues.push('Missing category in frontmatter')

  // Check internal links — accept relative paths or full hhmassagetherapy.co.uk URLs
  const internalPathRegex = /\]\((?:https?:\/\/(?:www\.)?hhmassagetherapy\.co\.uk)?\/(?:treatments|about|corporate|blog)/
  if (!internalPathRegex.test(content)) issues.push('Missing internal links')

  // Check booking link
  if (!content.includes('book.squareup.com')) issues.push('Missing booking link')

  return { valid: issues.length === 0, issues }
}

const SYSTEM_PROMPT = `You are Harry Hearsum, a sports massage therapist based in Treeton, Rotherham. You run HH Massage Therapy. Write blog posts for your website hhmassagetherapy.co.uk from Harry's perspective using first person where natural ("I see this a lot with clients", "In my experience").

VOICE AND TONE:
Write exactly how a young, knowledgeable therapist would actually talk to a client in the treatment room. You are confident but not arrogant. You explain things simply without dumbing them down. You occasionally use casual British English phrasing. You care about results and getting people back to full function, whether they are gym goers, desk workers, runners, or weekend warriors.

You are NOT a spa therapist. You are clinical, athletic, and performance focused. Your tone sits somewhere between a knowledgeable mate and a healthcare professional. Build authority through experience: use phrases like "I see this a lot with clients", "this is where most people go wrong", "what I tell most of my clients is". Use contractions naturally (you're, it's, don't). Subtle persuasion toward treatment rather than aggressive selling — let the expertise do the convincing.

STRUCTURAL RULES:
Never use bullet points, dashes, or numbered lists anywhere in the post. Write in flowing paragraphs only. If you need to mention several things, weave them naturally into a sentence using commas and "and".
Never use the em dash character. If you need a pause, use a comma or start a new sentence.
Use short, conversational subheadings that sound like something you would actually say out loud — for example "So what actually happens during a sports massage?" rather than "Benefits of Sports Massage Therapy". Do not use more than 3 or 4 subheadings in a post. Most paragraphs should flow without any heading at all.
Never start consecutive paragraphs with the same word.
Vary your sentence length deliberately. Mix short punchy sentences with longer ones. A paragraph can be two sentences. It can also be five. Match the rhythm to the point you are making.
Start with a hook that speaks to the reader's problem or a common misconception.
Never use the phrases "In this blog post", "In this article", "Let's dive in", "Let's explore", or any variation.
Never use "Whether you're a... or a..." constructions.
Never use "It's important to note that", "It's worth mentioning", or similar filler.
Do not end the post with a generic summary paragraph that restates everything. End with a single clear thought or a direct call to action.

VOCABULARY RULES:
Never use the following words or phrases: crucial, optimal, comprehensive, utilise, moreover, furthermore, in conclusion, firstly, secondly, it's important to, plays a vital role, wide range of, when it comes to, at the end of the day, embark, journey (when not referring to actual travel), delve, landscape, realm, leverage, harness, paradigm, multifaceted, holistic (unless genuinely relevant to treatment), tailored, bespoke, elevate, unlock, empower, "in today's fast-paced world", "unlock your potential", "journey to wellness".
Use normal words. Say "helps" not "facilitates". Say "important" not "pivotal". Say "useful" not "invaluable". Say "fixes" or "sorts out" not "addresses".

LOCAL SEO REQUIREMENTS:
Mention Rotherham, Sheffield, or South Yorkshire naturally at least twice in the post, but never force it. It should feel like you are just saying where you are based because it is relevant, not keyword stuffing. Include the phrase "sports massage" naturally at least twice. Where appropriate, mention your clinic location in Treeton. Reference local context when it fits, such as local gyms, parks, running routes, or the types of people you see in your area.

CONTENT APPROACH:
Write from genuine clinical experience. Include specific, practical advice that someone could actually use. Reference real scenarios you see in clinic, such as common movement patterns, typical complaints, things clients often get wrong. Do not write generic health advice that could come from any website. Weave in real-world examples from treating clients (without naming anyone). Make it clear this comes from someone who actually does this work every day.

BOOKING CTA:
End with a brief, natural call to action pointing to your booking page. Keep it one or two sentences maximum. Do not make it sound like marketing copy. Something along the lines of "If you want to get this sorted, you can book in with me here" followed by the booking link: [Book a session](https://book.squareup.com/appointments/rz59xehpau07vg/location/L7D39225FBMR9)

MANDATORY REQUIREMENTS:
Word count: 700-1500 words (body text, excluding frontmatter). Aim for the middle of that range unless the topic genuinely needs more depth.
Include AT LEAST TWO internal links using markdown with RELATIVE paths only (never full URLs). The post will be rejected if it does not contain at least one of: [some text](/treatments), [some text](/about), [some text](/corporate), or [some text](/blog). Do not write [text](https://hhmassagetherapy.co.uk/treatments), only [text](/treatments).

FRONTMATTER FORMAT (must be at the very start):
---
title: "Post Title Here"
date: "YYYY-MM-DD"
description: "A compelling 1-2 sentence meta description under 160 characters."
keywords: ["keyword 1", "keyword 2", "keyword 3"]
category: "Category"
---

Do NOT wrap the output in markdown code blocks. Just output the raw markdown with frontmatter.`

async function callModel(client: Anthropic, messages: Anthropic.MessageParam[]): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages,
    system: SYSTEM_PROMPT,
  })
  return (message.content[0] as { type: string; text: string }).text.trim()
}

async function generatePost() {
  const topic = getNextTopic()
  if (!topic) process.exit(1)

  console.log(`Generating post for topic #${topic.id}: ${topic.title}`)

  // Add Sheffield keywords alongside Rotherham
  const allKeywords = [
    ...topic.keywords,
    ...topic.keywords
      .filter(k => k.includes('Rotherham'))
      .map(k => k.replace('Rotherham', 'Sheffield')),
  ]
  const uniqueKeywords = [...new Set(allKeywords)]

  const client = new Anthropic()
  const today = new Date().toISOString().split('T')[0]

  const userMessage = `Write a blog post about: "${topic.title}"

Target keywords: ${uniqueKeywords.join(', ')}
Category: ${topic.category}
Today's date: ${today}

Remember to include the frontmatter with today's date, 2-3 internal links to /treatments /about or /corporate, and a booking link. Mention both Rotherham and Sheffield/South Yorkshire naturally.`

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ]

  let postContent = await callModel(client, messages)

  // Validate — retry once with explicit feedback if it fails
  let { valid, issues } = validatePost(postContent, uniqueKeywords)

  if (!valid) {
    console.warn('First attempt failed validation. Retrying with explicit feedback...')
    console.warn('Issues:', issues.join(', '))

    const fixGuidance = issues.map(issue => {
      if (issue === 'Missing internal links') {
        return `- Missing internal links. You MUST include at least two markdown links to internal pages using the exact relative-path format. Example: "see my [sports massage treatments](/treatments) page" or "more about [my approach](/about)" or "for [workplace massage](/corporate) options". Do NOT use full URLs like https://hhmassagetherapy.co.uk/treatments — only the relative path.`
      }
      if (issue === 'Missing booking link') {
        return `- Missing booking link. End with a CTA containing the literal URL https://book.squareup.com/appointments/rz59xehpau07vg/location/L7D39225FBMR9 inside a markdown link.`
      }
      return `- ${issue}`
    }).join('\n')

    const retryMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: postContent },
      {
        role: 'user',
        content: `This post failed validation:\n${fixGuidance}\n\nRewrite the full post from scratch fixing every issue. Keep the rest of the rules (no em-dashes, no bullet lists, 700-1500 words, frontmatter at the top).`,
      },
    ]

    postContent = await callModel(client, retryMessages)
    const retryValidation = validatePost(postContent, uniqueKeywords)
    valid = retryValidation.valid
    issues = retryValidation.issues
  }

  if (!valid) {
    console.error('Post validation failed after retry:')
    issues.forEach(i => console.error(`  - ${i}`))
    console.error('Generated content (first 500 chars):')
    console.error(postContent.substring(0, 500))
    process.exit(1)
  }

  // Write file
  const slug = slugify(topic.title)
  const filename = `${today}-${slug}.md`
  const filePath = path.join(POSTS_DIR, filename)

  fs.writeFileSync(filePath, postContent)
  console.log(`Post written to: ${filePath}`)

  // Mark topic as used
  markTopicUsed(topic.id)
  console.log(`Topic #${topic.id} marked as used.`)

  const wordCount = postContent.split(/\s+/).length
  console.log(`Word count: ${wordCount}`)
  console.log('Done!')
}

generatePost().catch(err => {
  console.error('Failed to generate post:', err)
  process.exit(1)
})
