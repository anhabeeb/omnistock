import { useQuery } from "@tanstack/react-query";

export interface ActivityLog {
  id: string;
  actor_user_id: string;
  actor_username: string;
  actor_role: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  reference_number: string | null;
  summary: string;
  details_json: any;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source_ip: string | null;
  created_at: string;
}

export interface ActivityFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  actionType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ActivityResponse {
  data: ActivityLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const useActivityFeed = (filters: ActivityFilters) => {
  return useQuery<ActivityResponse>({
    queryKey: ["activity", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value.toString());
        }
      });

      const res = await fetch(`/api/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      return res.json();
    },
    staleTime: 30000, // 30 seconds
  });
};

export const useEntityActivity = (entityType: string, entityId: string) => {
  return useQuery<ActivityLog[]>({
    queryKey: ["activity-entity", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/activity/entity/${entityType}/${entityId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch entity activity");
      return res.json();
    },
    enabled: !!entityType && !!entityId,
    staleTime: 30000,
  });
};
