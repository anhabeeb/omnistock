import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';

export class EventListenerService {
  private static intervalId: number | null = null;
  private static lastEventTimestamp: string = new Date().toISOString();
  private static isPolling = false;

  static start(queryClient: QueryClient) {
    if (this.intervalId) return;

    // Initial timestamp should be slightly in the past to catch missed events during load
    this.lastEventTimestamp = new Date(Date.now() - 30000).toISOString();

    this.intervalId = window.setInterval(() => {
      this.poll(queryClient);
    }, 5000); // Poll every 5 seconds
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private static async poll(queryClient: QueryClient) {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const response = await axios.get(`/api/events/poll?since=${encodeURIComponent(this.lastEventTimestamp)}`);
      const events = response.data;

      if (Array.isArray(events) && events.length > 0) {
        for (const event of events) {
          await this.handleEvent(event, queryClient);
          this.lastEventTimestamp = event.created_at;
        }
      }
    } catch (error) {
      console.error("Event polling failed:", error);
    } finally {
      this.isPolling = false;
    }
  }

  private static async handleEvent(event: any, queryClient: QueryClient) {
    const { event_type, entity_type } = event;

    console.log(`Handling event: ${event_type}`, event);

    // 1. Invalidate TanStack Query
    if (entity_type === 'item') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "items"] });
    } else if (entity_type === 'supplier') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "suppliers"] });
    } else if (entity_type === 'godown') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "godowns"] });
    } else if (entity_type === 'outlet') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "outlets"] });
    } else if (entity_type === 'category') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "categories"] });
    } else if (entity_type === 'unit') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "units"] });
    } else if (event_type === 'inventory.changed') {
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["expiry-alerts"] });
    } else if (event_type === 'grn.posted') {
      queryClient.invalidateQueries({ queryKey: ["grn"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    } else if (event_type === 'issue.posted') {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    } else if (event_type === 'transfer.dispatched' || event_type === 'transfer.received') {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    } else if (event_type === 'adjustment.posted') {
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
    } else if (event_type === 'stockcount.posted') {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["current-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } else if (event_type === 'wastage.posted') {
      queryClient.invalidateQueries({ queryKey: ["wastage"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    } else if (event_type === 'request.updated') {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    } else if (event_type === 'notification.created') {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } else if (event_type === 'settings.updated') {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  }
}
