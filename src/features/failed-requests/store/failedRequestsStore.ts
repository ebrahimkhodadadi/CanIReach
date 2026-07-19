import { create } from "zustand";
import { FailedRequestRecord, FailedRequestFilters } from "../types";
import { queryFailedRequests } from "../../probes/api/probeCommands";

interface FailedRequestsState {
  requests: FailedRequestRecord[];
  loading: boolean;
  filters: FailedRequestFilters;
  selectedRequest: FailedRequestRecord | null;
  page: number;
  pageSize: number;

  fetchRequests: () => Promise<void>;
  setFilters: (filters: FailedRequestFilters) => void;
  setPage: (page: number) => void;
  setSelectedRequest: (req: FailedRequestRecord | null) => void;
  clearFilters: () => void;
  clearAll: () => Promise<void>;
}

export const useFailedRequestsStore = create<FailedRequestsState>((set, get) => ({
  requests: [],
  loading: false,
  filters: {},
  selectedRequest: null,
  page: 1,
  pageSize: 20,

  fetchRequests: async () => {
    const { filters, page, pageSize } = get();
    set({ loading: true });
    try {
      const offset = (page - 1) * pageSize;
      const requests = await queryFailedRequests(pageSize, offset, filters);
      set({ requests });
    } catch (err) {
      console.error("Failed to load failed requests:", err);
    } finally {
      set({ loading: false });
    }
  },

  setFilters: (filters) => {
    set({ filters, page: 1 });
    get().fetchRequests();
  },

  setPage: (page) => {
    set({ page });
    get().fetchRequests();
  },

  setSelectedRequest: (selectedRequest) => set({ selectedRequest }),

  clearFilters: () => {
    set({ filters: {}, page: 1 });
    get().fetchRequests();
  },

  clearAll: async () => {
    try {
      const { clearNetworkOperations } = await import("../../probes/api/probeCommands");
      await clearNetworkOperations();
      set({ requests: [], page: 1 });
    } catch (err) {
      console.error("Failed to clear operations:", err);
    }
  },
}));
