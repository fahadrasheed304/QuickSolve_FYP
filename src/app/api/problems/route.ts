import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { rankStudentBids } from '@/lib/rank-student-bids'
import { getStudentSubjects, isStudentClassLevel, SESSION_DURATIONS } from '@/lib/student-problem-options'

const MAX_PROBLEM_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await decrypt(token)
    if (!session?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const formData = await request.formData()
    const subjectField = formData.get('subject')
    const subject = typeof subjectField === 'string' ? subjectField.trim() : ''
    const amount = Number(formData.get('amount'))
    const duration = Number(formData.get('duration'))
    const detailsField = formData.get('details')
    const details = typeof detailsField === 'string' ? detailsField : ''
    const classField = formData.get('class')
    const studentClass = classField === null ? '10th' : typeof classField === 'string' ? classField.trim() : ''
    const imageField = formData.get('image')
    const image = imageField instanceof File && imageField.size > 0 ? imageField : null

    if (!subject || !amount || !duration) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!isStudentClassLevel(studentClass)) {
      return NextResponse.json({ error: 'Select a valid class level.' }, { status: 400 })
    }
    if (!(getStudentSubjects(studentClass) as readonly string[]).includes(subject)) {
      return NextResponse.json({ error: 'Select a valid subject for this class level.' }, { status: 400 })
    }
    if (!(SESSION_DURATIONS as readonly number[]).includes(duration)) {
      return NextResponse.json({ error: 'Choose a session duration of 15, 30, 45, or 60 minutes.' }, { status: 400 })
    }
    const minimumOfferPrice = Math.max(200, duration / 15 * 200 - 50)
    if (!Number.isSafeInteger(amount) || amount < minimumOfferPrice || amount > 2000) {
      return NextResponse.json({ error: `Offer price must be between Rs. ${minimumOfferPrice} and Rs. 2,000. It can be at most Rs. 50 below the suggested price.` }, { status: 400 })
    }
    if (!details.trim() && !image) {
      return NextResponse.json({ error: 'Enter problem details or attach an image.' }, { status: 400 })
    }
    if (image && (image.size > MAX_PROBLEM_IMAGE_BYTES || !IMAGE_SIGNATURES[image.type])) {
      return NextResponse.json({ error: 'Upload a JPEG or PNG image no larger than 5 MB.' }, { status: 400 })
    }

    let imageUrl: string | undefined = undefined

    if (image) {
      const bytes = await image.arrayBuffer()
      const buffer = Buffer.from(bytes)
      if (!IMAGE_SIGNATURES[image.type](buffer)) {
        return NextResponse.json({ error: 'The uploaded file does not match its image format.' }, { status: 400 })
      }
      
      const fileName = `${Date.now()}-${image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      
      const { error: uploadError } = await supabaseAdmin
        .storage
        .from('problem-images')
        .upload(fileName, buffer, {
          contentType: image.type,
          upsert: false
        })

      if (uploadError) {
        console.error("Upload error:", uploadError)
        return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
      }

      const { data: { publicUrl } } = supabaseAdmin
        .storage
        .from('problem-images')
        .getPublicUrl(fileName)
        
      imageUrl = publicUrl
    }

    // Create problem in Supabase
    const problem = await DB.createProblem({
      studentEmail: session.email as string,
      subject,
      class: studentClass,
      details: details || '',
      offerPrice: amount,
      durationMin: duration,
      imageUrl,
    })

    return NextResponse.json({ success: true, problem, bids: [] })

  } catch (error: unknown) {
    console.error("Post problem error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Optional GET to fetch open problems
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await decrypt(token)
  if (!session?.email) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  try {
    const problems = await DB.getProblemsForStudent(session.email as string)
    return NextResponse.json({ problems: await rankStudentBids(problems) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
