import { auth, db } from '../firebase'
import { cache, CACHE_KEYS } from '../cache'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

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

  const classesCol = collection(db, 'classes')
  const q = query(classesCol, orderBy('name', 'asc'))
  const snapshot = await getDocs(q)

  if (snapshot.empty) return []

  const classes: any[] = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    classes.push({
      id: docSnap.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
      updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
    })
  })

  // Lấy teacher_ids
  const teacherIds = [...new Set(classes.map((c: any) => c.homeroom_teacher_id).filter(Boolean))]
  let teachersMap: Record<string, any> = {}

  if (teacherIds.length > 0) {
    const profilesCol = collection(db, 'profiles')
    const teachersQuery = query(profilesCol, where('id', 'in', teacherIds))
    const teachersSnap = await getDocs(teachersQuery)
    teachersSnap.forEach((t) => {
      const data = t.data()
      teachersMap[data.id || t.id] = {
        id: data.id || t.id,
        full_name: data.full_name,
        email: data.email,
      }
    })
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
  const classDoc = await getDoc(doc(db, 'classes', id))
  if (!classDoc.exists()) {
    throw new Error('Class not found')
  }

  const data = classDoc.data()
  let homeroomTeacher = null

  if (data.homeroom_teacher_id) {
    const teacherDoc = await getDoc(doc(db, 'profiles', data.homeroom_teacher_id))
    if (teacherDoc.exists()) {
      const teacherData = teacherDoc.data()
      homeroomTeacher = {
        id: teacherData.id || teacherDoc.id,
        full_name: teacherData.full_name,
        email: teacherData.email,
      }
    }
  }

  return {
    id: classDoc.id,
    ...data,
    created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
    updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
    homeroom_teacher: homeroomTeacher,
  } as Class
}

// Tạo lớp học mới (chỉ admin)
export async function createClass(classData: CreateClassData) {
  const now = new Date().toISOString()
  const newClass = {
    ...classData,
    total_students: classData.total_students || 0,
    created_at: Timestamp.fromDate(new Date(now)),
    updated_at: Timestamp.fromDate(new Date(now)),
  }

  const docRef = await addDoc(collection(db, 'classes'), newClass)
  return getClassById(docRef.id)
}

// Cập nhật lớp học (chỉ admin)
export async function updateClass(id: string, classData: UpdateClassData) {
  const classRef = doc(db, 'classes', id)
  await updateDoc(classRef, {
    ...classData,
    updated_at: Timestamp.fromDate(new Date()),
  })
  return getClassById(id)
}

// Xóa lớp học (chỉ admin)
export async function deleteClass(id: string) {
  await deleteDoc(doc(db, 'classes', id))
}

// Lấy học sinh trong lớp
export async function getClassStudents(classId: string) {
  const classStudentsCol = collection(db, 'class_students')
  // Tránh yêu cầu index: lấy tất cả rồi filter & sort ở client
  const snapshot = await getDocs(classStudentsCol)

  if (snapshot.empty) return []

  const studentIds = new Set<string>()
  const classStudents: any[] = []

  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    if (data.class_id === classId) {
      classStudents.push({
        id: docSnap.id,
        ...data,
        joined_at: data.joined_at?.toDate?.()?.toISOString() || data.joined_at,
      })
      if (data.student_id) studentIds.add(data.student_id)
    }
  })

  // Sắp xếp theo joined_at tăng dần ở client
  classStudents.sort(
    (a, b) =>
      new Date(a.joined_at || 0).getTime() - new Date(b.joined_at || 0).getTime()
  )

  // Lấy thông tin students
  const studentsMap: Record<string, any> = {}
  if (studentIds.size > 0) {
    const profilesCol = collection(db, 'profiles')
    const studentsQuery = query(profilesCol, where('id', 'in', Array.from(studentIds)))
    const studentsSnap = await getDocs(studentsQuery)
    studentsSnap.forEach((s) => {
      const data = s.data()
      studentsMap[data.id || s.id] = {
        id: data.id || s.id,
        full_name: data.full_name,
        email: data.email,
        student_code: data.student_code,
      }
    })
  }

  return classStudents.map((cs) => ({
    ...cs,
    student: cs.student_id ? studentsMap[cs.student_id] || null : null,
  })) as ClassStudent[]
}

// Thêm học sinh vào lớp (admin hoặc giáo viên chủ nhiệm)
export async function addStudentToClass(classId: string, studentId: string) {
  const now = new Date().toISOString()
  const docRef = await addDoc(collection(db, 'class_students'), {
    class_id: classId,
    student_id: studentId,
    joined_at: Timestamp.fromDate(new Date(now)),
  })

  // Cập nhật class_id trong profiles
  const profileRef = doc(db, 'profiles', studentId)
  await updateDoc(profileRef, { class_id: classId })

  // Lấy thông tin student
  const studentDoc = await getDoc(profileRef)
  const studentData = studentDoc.exists() ? studentDoc.data() : null

  return {
    id: docRef.id,
    class_id: classId,
    student_id: studentId,
    joined_at: now,
    student: studentData
      ? {
          id: studentData.id || studentId,
          full_name: studentData.full_name,
          email: studentData.email,
          student_code: studentData.student_code,
        }
      : null,
  } as ClassStudent
}

// Xóa học sinh khỏi lớp (admin hoặc giáo viên chủ nhiệm)
export async function removeStudentFromClass(classId: string, studentId: string) {
  // Tìm class_students document
  const classStudentsCol = collection(db, 'class_students')
  const q = query(
    classStudentsCol,
    where('class_id', '==', classId),
    where('student_id', '==', studentId)
  )
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    snapshot.forEach(async (docSnap) => {
      await deleteDoc(doc(db, 'class_students', docSnap.id))
    })
  }

  // Xóa class_id trong profiles
  const profileRef = doc(db, 'profiles', studentId)
  await updateDoc(profileRef, { class_id: null })
}

// Học sinh tự chọn lớp (chỉ được chọn 1 lần)
export async function joinClass(classId: string) {
  return new Promise<ClassStudent>((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        reject(new Error('Chưa đăng nhập'))
        return
      }

      try {
        // Kiểm tra xem học sinh đã có lớp chưa
        const classStudentsCol = collection(db, 'class_students')
        const existingQuery = query(classStudentsCol, where('student_id', '==', user.uid))
        const existingSnap = await getDocs(existingQuery)

        if (!existingSnap.empty) {
          reject(new Error('Bạn đã tham gia lớp học rồi'))
          return
        }

        const now = new Date().toISOString()
        const docRef = await addDoc(collection(db, 'class_students'), {
          class_id: classId,
          student_id: user.uid,
          joined_at: Timestamp.fromDate(new Date(now)),
        })

        // Cập nhật class_id trong profiles
        const profileRef = doc(db, 'profiles', user.uid)
        await updateDoc(profileRef, { class_id: classId })

        // Lấy thông tin class
        const classDoc = await getDoc(doc(db, 'classes', classId))
        const classData = classDoc.exists() ? classDoc.data() : null

        resolve({
          id: docRef.id,
          class_id: classId,
          student_id: user.uid,
          joined_at: now,
          class: classData
            ? {
                id: classDoc.id,
                ...classData,
                created_at: classData.created_at?.toDate?.()?.toISOString() || classData.created_at,
                updated_at: classData.updated_at?.toDate?.()?.toISOString() || classData.updated_at,
              }
            : undefined,
        } as ClassStudent)
      } catch (error) {
        reject(error)
      }
    })
  })
}

// Lấy lớp học sinh đã tham gia (tối ưu - chỉ lấy class_id từ profiles, có cache)
export async function getMyClass(useCache = true) {
  return new Promise<ClassStudent | null>((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        resolve(null)
        return
      }

      try {
        // Kiểm tra cache trước
        if (useCache) {
          const cached = cache.get<ClassStudent | null>(CACHE_KEYS.myClass(user.uid))
          if (cached !== null) {
            resolve(cached)
            return
          }
        }

        // Kiểm tra class_id trong profiles trước (nhanh hơn)
        const profileDoc = await getDoc(doc(db, 'profiles', user.uid))
        if (!profileDoc.exists()) {
          if (useCache) {
            cache.set(CACHE_KEYS.myClass(user.uid), null, 10000)
          }
          resolve(null)
          return
        }

        const profileData = profileDoc.data()
        if (!profileData?.class_id) {
          if (useCache) {
            cache.set(CACHE_KEYS.myClass(user.uid), null, 10000)
          }
          resolve(null)
          return
        }

        // Tìm class_students document
        const classStudentsCol = collection(db, 'class_students')
        const q = query(
          classStudentsCol,
          where('student_id', '==', user.uid),
          where('class_id', '==', profileData.class_id)
        )
        const classStudentSnap = await getDocs(q)

        if (classStudentSnap.empty) {
          if (useCache) {
            cache.set(CACHE_KEYS.myClass(user.uid), null, 10000)
          }
          resolve(null)
          return
        }

        const classStudentDoc = classStudentSnap.docs[0]
        const classStudentData = classStudentDoc.data()

        // Lấy thông tin class
        const classDoc = await getDoc(doc(db, 'classes', profileData.class_id))
        if (!classDoc.exists()) {
          if (useCache) {
            cache.set(CACHE_KEYS.myClass(user.uid), null, 10000)
          }
          resolve(null)
          return
        }

        const classData = classDoc.data()

        // Lấy thông tin teacher nếu có
        let homeroomTeacher = null
        if (classData.homeroom_teacher_id) {
          const teacherDoc = await getDoc(doc(db, 'profiles', classData.homeroom_teacher_id))
          if (teacherDoc.exists()) {
            const teacherData = teacherDoc.data()
            homeroomTeacher = {
              id: teacherData.id || teacherDoc.id,
              full_name: teacherData.full_name,
              email: teacherData.email,
            }
          }
        }

        const result = {
          id: classStudentDoc.id,
          ...classStudentData,
          joined_at: classStudentData.joined_at?.toDate?.()?.toISOString() || classStudentData.joined_at,
          class: {
            id: classDoc.id,
            ...classData,
            created_at: classData.created_at?.toDate?.()?.toISOString() || classData.created_at,
            updated_at: classData.updated_at?.toDate?.()?.toISOString() || classData.updated_at,
            homeroom_teacher: homeroomTeacher,
          },
        } as ClassStudent

        // Cache kết quả (60 giây)
        if (useCache) {
          cache.set(CACHE_KEYS.myClass(user.uid), result, 60000)
        }

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  })
}

// Lấy các lớp giáo viên chủ nhiệm
export async function getMyHomeroomClasses() {
  return new Promise<Class[]>((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        resolve([])
        return
      }

      try {
        const classesCol = collection(db, 'classes')
        // Tránh yêu cầu index: lấy tất cả rồi filter & sort ở client
        const snapshot = await getDocs(classesCol)

        if (snapshot.empty) {
          resolve([])
          return
        }

        const classes: Class[] = []
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any
          if (data.homeroom_teacher_id === user.uid) {
            classes.push({
              id: docSnap.id,
              ...data,
              created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
              updated_at: data.updated_at?.toDate?.()?.toISOString() || data.updated_at,
            } as Class)
          }
        })

        // Sắp xếp theo tên lớp A-Z ở client
        classes.sort((a, b) => a.name.localeCompare(b.name))

        resolve(classes)
      } catch (error) {
        reject(error)
      }
    })
  })
}

