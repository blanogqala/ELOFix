import { User } from '@/types';
import apiClient from '@/api/client';

interface UserResponse {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    role: string;
    createdAt: string;
  };
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const { data } = await apiClient.get<UserResponse>(`/users/${id}`);
    if (!data?.user) return null;
    return {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      phone: data.user.phone ?? '',
      role: 'user',
      createdAt: data.user.createdAt,
    };
  } catch {
    return null;
  }
}
