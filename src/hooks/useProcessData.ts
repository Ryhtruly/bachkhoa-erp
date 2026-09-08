import { useState, useEffect, useCallback } from 'react';
import { ProcessModule, NodeDetail, ChecklistItem, AttachmentFile } from '../types/process';
import { processService } from '../services/processService';

export function useProcessData() {
  const [module, setModule] = useState<ProcessModule | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string>('K01');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load from the data service
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await processService.getProcessModule(forceRefresh);
      setModule(data);
      if (data.activeNodeId) {
        setActiveNodeId(data.activeNodeId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu quy trình';
      setError(msg);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Switch the actively displayed node
  const switchNode = useCallback(async (nodeId: string) => {
    try {
      setIsUpdating(true);
      setActiveNodeId(nodeId);
      const updatedModule = await processService.setActiveNode(nodeId);
      setModule(updatedModule);
    } catch (err: unknown) {
      console.error('Failed to switch node:', err);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Resolve a rejection item
  const resolveRejection = useCallback(
    async (
      nodeId: string,
      itemId: string,
      payload: { newFileName: string; uploaderInfo?: string; resolutionNote?: string }
    ) => {
      try {
        setIsUpdating(true);
        const { updatedNode } = await processService.resolveRejection(nodeId, itemId, payload);
        setModule((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [nodeId]: updatedNode,
            },
          };
        });
        return true;
      } catch (err: unknown) {
        console.error('Failed to resolve rejection:', err);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Upload an attachment
  const addAttachment = useCallback(
    async (nodeId: string, file: Omit<AttachmentFile, 'id' | 'uploadDate'>) => {
      try {
        setIsUpdating(true);
        const { updatedNode } = await processService.addAttachment(nodeId, file);
        setModule((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [nodeId]: updatedNode,
            },
          };
        });
        return true;
      } catch (err: unknown) {
        console.error('Failed to add attachment:', err);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Add a new checklist item
  const addChecklistItem = useCallback(
    async (nodeId: string, itemData: Omit<ChecklistItem, 'id' | 'updateDate'>) => {
      try {
        setIsUpdating(true);
        const { updatedNode } = await processService.addChecklistItem(nodeId, itemData);
        setModule((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [nodeId]: updatedNode,
            },
          };
        });
        return true;
      } catch (err: unknown) {
        console.error('Failed to add checklist item:', err);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Update a checklist item's attached file (upload/replace)
  const updateChecklistItemFile = useCallback(
    async (
      nodeId: string,
      itemId: string,
      fileInfo: {
        fileName: string;
        fileSize?: string;
        fileType?: string;
        fileDataUrl?: string;
        uploaderInfo?: string;
        note?: string;
        autoResolveIfRejected?: boolean;
      }
    ) => {
      try {
        setIsUpdating(true);
        const { updatedNode } = await processService.updateChecklistItemFile(nodeId, itemId, fileInfo);
        setModule((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [nodeId]: updatedNode,
            },
          };
        });
        return true;
      } catch (err: unknown) {
        console.error('Failed to update checklist file:', err);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Submit node for inspection
  const submitNode = useCallback(
    async (nodeId: string) => {
      try {
        setIsUpdating(true);
        const result = await processService.submitNodeInspection(nodeId);
        if (result.success) {
          // Refresh module state
          const updated = await processService.getProcessModule();
          setModule(updated);
          if (result.nextNodeId) {
            setActiveNodeId(result.nextNodeId);
          }
        }
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi khi nộp nghiệm thu';
        return { success: false, message: msg };
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Reset to original JSON data
  const resetData = useCallback(async () => {
    setIsLoading(true);
    try {
      const original = await processService.resetToOriginal();
      setModule(original);
      setActiveNodeId(original.activeNodeId || 'K01');
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const activeNode: NodeDetail | null =
    module && activeNodeId && module.nodes[activeNodeId]
      ? module.nodes[activeNodeId]
      : null;

  return {
    module,
    activeNodeId,
    activeNode,
    isLoading,
    isUpdating,
    error,
    switchNode,
    resolveRejection,
    addAttachment,
    addChecklistItem,
    updateChecklistItemFile,
    submitNode,
    reloadData: () => loadData(true),
    resetData,
  };
}
