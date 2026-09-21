import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'scratch', 'mcqs_math_matric.json')
    const rawData = fs.readFileSync(filePath, 'utf-8')
    const mcqs: Array<{ subject: string; class_level: string; question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: "option_a" | "option_b" | "option_c" | "option_d"; difficulty: string; time_seconds?: number }> = JSON.parse(rawData)

    const insertData = mcqs.map((q) => ({
      subject: q.subject,
      class_level: q.class_level,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q[q.correct_option], // This resolves "option_b" to the actual string value
      difficulty: q.difficulty,
      time_seconds: q.time_seconds || 30,
      is_active: true
    }))

    const { error } = await supabaseAdmin
      .from('test_questions')
      .insert(insertData)

    if (error) throw error

    return NextResponse.json({ success: true, count: mcqs.length })
  } catch (caughtError: unknown) {
    const error = caughtError instanceof Error ? caughtError : new Error("Unexpected error")
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
