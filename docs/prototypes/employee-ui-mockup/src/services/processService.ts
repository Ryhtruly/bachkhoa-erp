/**
 * Process Service Layer
 * 
 * Provides a clean abstraction between the UI and data storage.
 * Designed to seamlessly switch between local JSON fetching and live REST API endpoints.
 */

import {
  ProcessModule,
  ProcessDataResponse,
  NodeDetail,
  ChecklistItem,
  AttachmentFile,
  SubmissionResult,
} from '../types/process';
import { apiClient } from './apiClient';

const LOCAL_STORAGE_KEY = 'geo_process_state_v1';

class ProcessService {
  private inMemoryCache: ProcessModule | null = null;
  private isInitialized = false;

  /**
   * Initializes the service, loading from local JSON or stored state
   */
  public async getProcessModule(forceRefresh = false): Promise<ProcessModule> {
    if (this.inMemoryCache && !forceRefresh) {
      return this.inMemoryCache;
    }

    // Check if we have modified state in localStorage
    if (!forceRefresh) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          this.inMemoryCache = JSON.parse(saved);
          this.isInitialized = true;
          return this.inMemoryCache!;
        }
      } catch (err) {
        console.warn('Could not read cached process state:', err);
      }
    }

    // Fetch asynchronously from the local JSON file (or remote API in future)
    try {
      const response = await apiClient.get<ProcessDataResponse>('/data/process-data.json');
      this.inMemoryCache = response.module;
      this.isInitialized = true;
      this.saveToStorage();
      return this.inMemoryCache;
    } catch (error) {
      console.error('Failed to load process data from JSON:', error);
      throw error;
    }
  }

  /**
   * Asynchronously fetches a specific node's details
   */
  public async getNodeDetail(nodeId: string): Promise<NodeDetail> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) {
      throw new Error(`Node with ID "${nodeId}" not found.`);
    }
    return node;
  }

  /**
   * Sets the active node in the process pipeline
   */
  public async setActiveNode(nodeId: string): Promise<ProcessModule> {
    const module = await this.getProcessModule();
    if (!module.nodes[nodeId]) {
      throw new Error(`Node ${nodeId} does not exist`);
    }

    module.activeNodeId = nodeId;
    module.steps = module.steps.map((step) => ({
      ...step,
      isCurrent: step.id === nodeId,
    }));

    this.saveToStorage();
    return { ...module };
  }

  /**
   * Resolves a rejected checklist item by submitting a corrected document
   */
  public async resolveRejection(
    nodeId: string,
    itemId: string,
    payload: {
      newFileName: string;
      uploaderInfo?: string;
      resolutionNote?: string;
    }
  ): Promise<{ item: ChecklistItem; updatedNode: NodeDetail }> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const itemIndex = node.checklistItems.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) throw new Error(`Checklist item ${itemId} not found`);

    const currentItem = node.checklistItems[itemIndex];
    const nowStr = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const updatedItem: ChecklistItem = {
      ...currentItem,
      status: 'valid',
      statusLabel: 'Hợp lệ',
      statusVariant: 'green',
      hasWarningIcon: false,
      fileName: payload.newFileName || currentItem.fileName,
      uploaderInfo: payload.uploaderInfo || 'Kỹ sư đo đạc - Đã đính chính',
      updateDate: `${nowStr}`,
      rejectionReason: undefined,
      resolvedAt: nowStr,
    };

    node.checklistItems[itemIndex] = updatedItem;

    // Check if there are still any rejected items
    const hasRemainingRejections = node.checklistItems.some((item) => item.status === 'rejected');
    if (!hasRemainingRejections) {
      node.submissionWarning = undefined;
    }

    this.saveToStorage();
    return { item: updatedItem, updatedNode: { ...node } };
  }

  /**
   * Updates an item's status directly
   */
  public async updateChecklistItem(
    nodeId: string,
    itemId: string,
    patch: Partial<ChecklistItem>
  ): Promise<NodeDetail> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    node.checklistItems = node.checklistItems.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item
    );

    const hasRemainingRejections = node.checklistItems.some((item) => item.status === 'rejected');
    if (!hasRemainingRejections) {
      node.submissionWarning = undefined;
    }

    this.saveToStorage();
    return { ...node };
  }

  /**
   * Updates an item's file and metadata directly (upload/replace file)
   */
  public async updateChecklistItemFile(
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
  ): Promise<{ item: ChecklistItem; updatedNode: NodeDetail }> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const itemIndex = node.checklistItems.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) throw new Error(`Checklist item ${itemId} not found`);

    const currentItem = node.checklistItems[itemIndex];
    const nowStr = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const isRejected = currentItem.status === 'rejected';
    const shouldResolve = isRejected && fileInfo.autoResolveIfRejected;

    const updatedItem: ChecklistItem = {
      ...currentItem,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize || currentItem.fileSize || '2.5 MB',
      fileType: fileInfo.fileType || fileInfo.fileName.split('.').pop()?.toLowerCase() || 'pdf',
      fileDataUrl: fileInfo.fileDataUrl || currentItem.fileDataUrl,
      updateDate: nowStr,
      uploaderInfo: fileInfo.uploaderInfo || currentItem.uploaderInfo,
      note: fileInfo.note !== undefined ? fileInfo.note : currentItem.note,
      ...(shouldResolve
        ? {
            status: 'valid' as const,
            statusLabel: 'Hợp lệ',
            statusVariant: 'green' as const,
            hasWarningIcon: false,
            rejectionReason: undefined,
            resolvedAt: nowStr,
          }
        : {}),
    };

    node.checklistItems[itemIndex] = updatedItem;

    const hasRemainingRejections = node.checklistItems.some((item) => item.status === 'rejected');
    if (!hasRemainingRejections) {
      node.submissionWarning = undefined;
    }

    this.saveToStorage();
    return { item: updatedItem, updatedNode: { ...node } };
  }

  /**
   * Uploads an attachment to the node's document cabinet
   */
  public async addAttachment(
    nodeId: string,
    file: Omit<AttachmentFile, 'id' | 'uploadDate'>
  ): Promise<{ attachment: AttachmentFile; updatedNode: NodeDetail }> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const now = new Date();
    const uploadDate = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()}`;

    const newAttachment: AttachmentFile = {
      id: `att-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type || 'file',
      uploadDate,
    };

    node.attachments.push(newAttachment);
    this.saveToStorage();
    return { attachment: newAttachment, updatedNode: { ...node } };
  }

  /**
   * Adds a new checklist document entry to the node
   */
  public async addChecklistItem(
    nodeId: string,
    itemData: Omit<ChecklistItem, 'id' | 'updateDate'>
  ): Promise<{ item: ChecklistItem; updatedNode: NodeDetail }> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const nowStr = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const newItem: ChecklistItem = {
      ...itemData,
      id: `chk-${Date.now()}`,
      updateDate: nowStr,
    };

    node.checklistItems.push(newItem);
    node.checklistLinkedCount = node.checklistItems.length;
    this.saveToStorage();
    return { item: newItem, updatedNode: { ...node } };
  }

  /**
   * Submits a node for inspection/acceptance
   */
  public async submitNodeInspection(nodeId: string): Promise<SubmissionResult> {
    const module = await this.getProcessModule();
    const node = module.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const rejectedItems = node.checklistItems.filter((i) => i.status === 'rejected');
    if (rejectedItems.length > 0) {
      return {
        success: false,
        message: `Không thể nộp nghiệm thu: Còn ${rejectedItems.length} hạng mục chưa được khắc phục lỗi từ chối.`,
      };
    }

    // Advance step: mark current step as completed and next as active
    const stepIdx = module.steps.findIndex((s) => s.id === nodeId);
    if (stepIdx !== -1) {
      module.steps[stepIdx].status = 'completed';
      module.steps[stepIdx].statusLabel = 'ĐÃ HOÀN THÀNH';

      const nextStep = module.steps[stepIdx + 1];
      if (nextStep) {
        nextStep.status = 'active';
        nextStep.statusLabel = 'ĐANG KÍCH HOẠT';
        nextStep.isCurrent = true;
        module.activeNodeId = nextStep.id;
        module.steps[stepIdx].isCurrent = false;
        this.saveToStorage();

        return {
          success: true,
          message: `Nghiệm thu ${node.code} thành công! Hệ thống đã tự động chuyển sang ${nextStep.code}.`,
          nextNodeId: nextStep.id,
        };
      }
    }

    this.saveToStorage();
    return {
      success: true,
      message: `Đã nộp nghiệm thu ${node.code} thành công!`,
    };
  }

  /**
   * Resets data back to original JSON state
   */
  public async resetToOriginal(): Promise<ProcessModule> {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    this.inMemoryCache = null;
    return this.getProcessModule(true);
  }

  private saveToStorage(): void {
    if (this.inMemoryCache) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.inMemoryCache));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    }
  }
}

export const processService = new ProcessService();
