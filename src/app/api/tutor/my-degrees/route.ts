import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

// GET /api/tutor/my-degrees
// Get all degrees for the logged-in tutor
export async function GET() {
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
    
    const degrees = await DB.getDegrees(session.email as string)
    
    return NextResponse.json({ degrees })
    
  } catch (error: any) {
    console.error('Get degrees error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get degrees' },
      { status: 500 }
    )
  }
}

// POST /api/tutor/my-degrees
// Add a new degree
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
    
    const body = await request.json()
    const { degreeName, institution, boardUniversity, yearCompleted } = body
    
    if (!degreeName || !institution || !boardUniversity || !yearCompleted) {
      return NextResponse.json({ error: 'All degree fields are required' }, { status: 400 })
    }
    
    const degree = await DB.addDegree(session.email as string, {
      degreeName,
      institution,
      boardUniversity,
      yearCompleted,
    })
    
    return NextResponse.json({ success: true, degree })
    
  } catch (error: any) {
    console.error('Add degree error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add degree' },
      { status: 500 }
    )
  }
}

// DELETE /api/tutor/my-degrees
// Delete a degree
export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const degreeId = searchParams.get('id')
    
    if (!degreeId) {
      return NextResponse.json({ error: 'Degree ID is required' }, { status: 400 })
    }
    
    await DB.deleteDegree(degreeId)
    
    return NextResponse.json({ success: true, message: 'Degree deleted' })
    
  } catch (error: any) {
    console.error('Delete degree error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete degree' },
      { status: 500 }
    )
  }
}

