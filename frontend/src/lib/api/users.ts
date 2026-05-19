import { User } from '@/types';
import apiClient from '@/api/client';

interface UserResponse {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    profileImage?: string | null;
    role: string;
    createdAt: string;
  };
}

function mapApiUser(row: UserResponse['user']): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    role: 'user',
    profileImage: row.profileImage || undefined,
    createdAt: row.createdAt,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const { data } = await apiClient.get<UserResponse>(`/users/${id}`);
    if (!data?.user) return null;
    return mapApiUser(data.user);
  } catch {
    return null;
  }
}

export async function updateUserProfile(
  userId: string,
  updates: { phone?: string; profileImage?: string | null }
): Promise<User> {
  const { data } = await apiClient.patch<UserResponse>(`/users/${userId}`, updates);
  if (!data?.user) throw new Error('Failed to update profile');
  return mapApiUser(data.user);
}

export async function uploadUserAvatar(userId: string, file: File): Promise<User> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<UserResponse>(`/users/${userId}/avatar`, fd);
  if (!data?.user) throw new Error('Failed to upload profile photo');
  return mapApiUser(data.user);
}
