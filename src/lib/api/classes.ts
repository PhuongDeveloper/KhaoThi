import { supabase } from '../supabase'
import { cache, CACHE_KEYS } from '../cache'

export interface Class {
  id: string
  name: string
  code: string
  total_students: number
  homeroom_teacher_id: string | null
  description: string | null
  created_at: string
  updated_at: string
  homeroom_teacher?: {
    id: string
    full_name: string
    email: string | null
  }
}

export interface ClassStudent {
  id: string
  class_id: string
  student_id: string
  joined_at: string
  student?: {
    id: string
    full_name: string
    email: string | null
    student_code: string | null
  }
  class?: Class
}

export interface CreateClassData {
  name: string
  code: string
  homeroom_teacher_id?: string | null
  description?: string
  total_students?: number
}

export interface UpdateClassData {
  name?: string
  code?: string
  homeroom_teacher_id?: string | null
  description?: string
}

// Lấy tất cả lớp học (có cache)
export async function getClasses(useCache = true) {
  // Kiểm tra cache trước
  if (useCache) {
    const cached = cache.get<Class[]>(CACHE_KEYS.classes)
    if (cached) return cached
  }

  // Tối ưu: Query đơn giản, không join để tránh chậm
  const { data: classes, error } = await supabase
    .from('classes')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  if (!classes || classes.length === 0) return []

  // Lấy teacher_ids
  const teacherIds = [...new Set(classes.map((c: any) => c.homeroom_teacher_id).filter(Boolean))]
  let teachersMap: Record<string, any> = {}

  if (teacherIds.length > 0) {
    const { data: teachers } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', teacherIds)
    if (teachers) {
      teachers.forEach((t: any) => {
        teachersMap[t.id] = t
      })
    }
  }

  // Combine data
  const result = classes.map((c: any) => ({
    ...c,
    homeroom_teacher: c.homeroom_teacher_id ? teachersMap[c.homeroom_teacher_id] || null : null,
  })) as Class[]

  // Cache kết quả (60 giây)
  if (useCache) {
    cache.set(CACHE_KEYS.classes, result, 60000)
  }

  return result
}

// Lấy lớp học theo ID
export async function getClassById(id: string) {
  const { data, error } = await supabase
    .from('classes')
    .select(`
      *,
      homeroom_teacher:profiles!classes_homeroom_teacher_id_fkey(
        id,
        full_name,
        email
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Class
}

// Tạo lớp học mới (chỉ admin)
export async function createClass(classData: CreateClassData) {
  const { data, error } = await supabase
    .from('classes')
    .insert(classData)
    .select(`
      *,
      homeroom_teacher:profiles!classes_homeroom_teacher_id_fkey(
        id,
        full_name,
        email
      )
    `)
    .single()

  if (error) throw error
  return data as Class
}

// Cập nhật lớp học (chỉ admin)
export async function updateClass(id: string, classData: UpdateClassData) {
  const { data, error } = await supabase
    .from('classes')
    .update({ ...classData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`
      *,
      homeroom_teacher:profiles!classes_homeroom_teacher_id_fkey(
        id,
        full_name,
        email
      )
    `)
    .single()

  if (error) throw error
  return data as Class
}

// Xóa lớp học (chỉ admin)
export async function deleteClass(id: string) {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Lấy học sinh trong lớp
export async function getClassStudents(classId: string) {
  const { data, error } = await supabase
    .from('class_students')
    .select(`
      *,
      student:profiles!class_students_student_id_fkey(
        id,
        full_name,
        email,
        student_code
      )
    `)
    .eq('class_id', classId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return data as ClassStudent[]
}

// Thêm học sinh vào lớp (admin hoặc giáo viên chủ nhiệm)
export async function addStudentToClass(classId: string, studentId: string) {
  const { data, error } = await supabase
    .from('class_students')
    .insert({
      class_id: classId,
      student_id: studentId,
    })
    .select(`
      *,
      student:profiles!class_students_student_id_fkey(
        id,
        full_name,
        email,
        student_code
      )
    `)
    .single()

  if (error) throw error

  // Cập nhật class_id trong profiles
  await supabase
    .from('profiles')
    .update({ class_id: classId })
    .eq('id', studentId)

  return data as ClassStudent
}

// Xóa học sinh khỏi lớp (admin hoặc giáo viên chủ nhiệm)
export async function removeStudentFromClass(classId: string, studentId: string) {
  const { error } = await supabase
    .from('class_students')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId)

  if (error) throw error

  // Xóa class_id trong profiles
  await supabase
    .from('profiles')
    .update({ class_id: null })
    .eq('id', studentId)
}

// Học sinh tự chọn lớp (chỉ được chọn 1 lần)
export async function joinClass(classId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')

  // Kiểm tra xem học sinh đã có lớp chưa
  const { data: existing } = await supabase
    .from('class_students')
    .select('id')
    .eq('student_id', user.id)
    .single()

  if (existing) {
    throw new Error('Bạn đã tham gia lớp học rồi')
  }

  const { data, error } = await supabase
    .from('class_students')
    .insert({
      class_id: classId,
      student_id: user.id,
    })
    .select(`
      *,
      class:classes!class_students_class_id_fkey(*)
    `)
    .single()

  if (error) throw error

  // Cập nhật class_id trong profiles
  await supabase
    .from('profiles')
    .update({ class_id: classId })
    .eq('id', user.id)

  return data as ClassStudent
}

// Lấy lớp học sinh đã tham gia (tối ưu - chỉ lấy class_id từ profiles, có cache)
export async function getMyClass(useCache = true) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Kiểm tra cache trước
  if (useCache) {
    const cached = cache.get<ClassStudent | null>(CACHE_KEYS.myClass(user.id))
    if (cached !== null) return cached // null có thể là valid value
  }

  // Kiểm tra class_id trong profiles trước (nhanh hơn)
  const { data: profile } = await supabase
    .from('profiles')
    .select('class_id')
    .eq('id', user.id)
    .single()

  if (!profile?.class_id) {
    // Cache null result (ngắn hơn - 10 giây)
    if (useCache) {
      cache.set(CACHE_KEYS.myClass(user.id), null, 10000)
    }
    return null
  }

  // Tối ưu: Query đơn giản, không join
  const { data: classStudent, error: csError } = await supabase
    .from('class_students')
    .select('*')
    .eq('student_id', user.id)
    .eq('class_id', profile.class_id)
    .single()

  if (csError && csError.code !== 'PGRST116') throw csError
  if (!classStudent) {
    if (useCache) {
      cache.set(CACHE_KEYS.myClass(user.id), null, 10000)
    }
    return null
  }

  // Lấy thông tin class
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('*')
    .eq('id', profile.class_id)
    .single()

  if (classError) throw classError

  // Lấy thông tin teacher nếu có
  let homeroomTeacher = null
  if (classData.homeroom_teacher_id) {
    const { data: teacher } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', classData.homeroom_teacher_id)
      .single()
    if (teacher) homeroomTeacher = teacher
  }

  const result = {
    ...classStudent,
    class: {
      ...classData,
      homeroom_teacher: homeroomTeacher,
    },
  } as ClassStudent

  // Cache kết quả (60 giây)
  if (useCache) {
    cache.set(CACHE_KEYS.myClass(user.id), result, 60000)
  }

  return result
}

// Lấy các lớp giáo viên chủ nhiệm
export async function getMyHomeroomClasses() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('classes')
    .select(`
      *,
      homeroom_teacher:profiles!classes_homeroom_teacher_id_fkey(
        id,
        full_name,
        email
      )
    `)
    .eq('homeroom_teacher_id', user.id)
    .order('name', { ascending: true })

  if (error) throw error
  return data as Class[]
}

