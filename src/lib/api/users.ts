import { supabase } from '../supabase'
import type { Database } from '../supabase'

type Profile = Database['public']['Tables']['profiles']['Row']

export const userApi = {
  async getAll(filters?: { role?: string }) {
    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.role) {
      query = query.eq('role', filters.role)
    }

    const { data, error } = await query
    if (error) throw error
    return data as Profile[]
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Profile
  },

  async update(id: string, profile: Database['public']['Tables']['profiles']['Update']) {
    const { data, error } = await supabase
      .from('profiles')
      .update(profile)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Profile
  },
}

