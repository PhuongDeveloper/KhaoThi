import { supabase } from '../supabase'
import type { Database } from '../supabase'

type Subject = Database['public']['Tables']['subjects']['Row']

export const subjectApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data as Subject[]
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Subject
  },

  async create(subject: Database['public']['Tables']['subjects']['Insert']) {
    const { data, error } = await supabase
      .from('subjects')
      .insert(subject)
      .select()
      .single()

    if (error) throw error
    return data as Subject
  },

  async update(id: string, subject: Database['public']['Tables']['subjects']['Update']) {
    const { data, error } = await supabase
      .from('subjects')
      .update(subject)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Subject
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', id)

    if (error) throw error
  },
}

