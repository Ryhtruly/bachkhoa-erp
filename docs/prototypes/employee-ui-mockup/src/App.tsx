/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProcessData } from './hooks/useProcessData';
import { Header } from './components/Header';
import { Stepper } from './components/Stepper';
import { NodeInfoCard } from './components/NodeInfoCard';
import { RemainingTimeCard } from './components/RemainingTimeCard';
import { TaskDescriptionCard } from './components/TaskDescriptionCard';
import { AttachmentsCard } from './components/AttachmentsCard';
import { CostBreakdownCard } from './components/CostBreakdownCard';
import { ChecklistSection } from './components/ChecklistSection';
import { ResolveRejectionModal } from './components/ResolveRejectionModal';
import { FileUploadModal } from './components/FileUploadModal';
import { AddChecklistModal } from './components/AddChecklistModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { ServiceInspectorModal } from './components/ServiceInspectorModal';
import { ChecklistItem } from './types/process';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export default function App() {
  const {
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
    reloadData,
    resetData,
  } = useProcessData();

  // Modal States
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedResolveItem, setSelectedResolveItem] = useState<ChecklistItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddChecklistOpen, setIsAddChecklistOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; size?: string; type?: string; dataUrl?: string } | null>(null);
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<ChecklistItem | null>(null);
  const [previewInitialTab, setPreviewInitialTab] = useState<'preview' | 'upload'>('preview');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Toast feedback state
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'info'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenResolve = (item: ChecklistItem) => {
    setSelectedResolveItem(item);
    setIsResolveModalOpen(true);
  };

  // Handler for opening preview/upload modal for checklist items
  const handleChecklistItemFileClick = (
    item: ChecklistItem,
    mode: 'preview' | 'upload' = 'preview'
  ) => {
    setSelectedChecklistItem(item);
    setPreviewFile({
      name: item.fileName,
      size: item.fileSize,
      type: item.fileType,
      dataUrl: item.fileDataUrl,
    });
    setPreviewInitialTab(mode);
    setIsPreviewModalOpen(true);
  };

  // Handler for opening preview for general attachments
  const handleOpenFilePreview = (file: { name: string; size?: string; type?: string }) => {
    setSelectedChecklistItem(null);
    setPreviewFile(file);
    setPreviewInitialTab('preview');
    setIsPreviewModalOpen(true);
  };

  const handleSubmitInspection = async () => {
    if (!activeNode) return;
    const result = await submitNode(activeNode.id);
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'warning');
    }
  };

  if (isLoading && !module) {
    return (
      <div className="min-h-screen bg-[#f0f4f9] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium text-slate-500 font-mono">
          Đang tải dữ liệu quy trình từ Data Service...
        </p>
      </div>
    );
  }

  if (error && !module) {
    return (
      <div className="min-h-screen bg-[#f0f4f9] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-200 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <h2 className="font-bold text-slate-800 text-sm mb-1">Không thể tải dữ liệu</h2>
          <p className="text-xs text-slate-500 mb-4">{error}</p>
          <button
            onClick={() => reloadData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!module || !activeNode) return null;

  return (
    <div className="min-h-screen bg-[#f0f4f9] py-4 px-3 sm:py-6 sm:px-6 md:py-8 md:px-8 flex justify-center">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top duration-200 max-w-md">
          <div
            className={`flex items-start gap-2.5 p-3.5 rounded-2xl shadow-lg border text-xs font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : toast.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-blue-600" />
            )}
            <span className="leading-tight">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Container Card */}
      <main
        id="process-node-card"
        className="w-full max-w-6xl bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 md:p-8 lg:p-9 transition-all"
      >
        {/* Top Header */}
        <Header
          category={module.category}
          title={module.title}
          stage={module.stage}
          isLoading={isLoading || isUpdating}
          onRefresh={reloadData}
          onOpenInspector={() => setIsInspectorOpen(true)}
        />

        {/* Process Stepper */}
        <Stepper
          steps={module.steps}
          activeNodeId={activeNodeId}
          onSelectStep={switchNode}
        />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 items-start">
          {/* LEFT COLUMN: Node Metadata, Time, Description, Files, Cost */}
          <section
            id="column-left-details"
            className="lg:col-span-5 flex flex-col gap-4"
          >
            {/* 1. Tên Node hiện tại */}
            <NodeInfoCard
              title={activeNode.title}
              codeTag={activeNode.codeTag}
            />

            {/* 2. Thời gian còn lại */}
            <RemainingTimeCard
              remainingTime={activeNode.remainingTime}
              onTimeStatus={activeNode.onTimeStatus}
            />

            {/* 3. Mô tả nhiệm vụ & Người phụ trách */}
            <TaskDescriptionCard
              description={activeNode.description}
              assignee={activeNode.assignee}
              assigneeRole={activeNode.assigneeRole}
            />

            {/* 4. Tủ hồ sơ đính kèm */}
            <AttachmentsCard
              attachments={activeNode.attachments}
              onUploadClick={() => setIsUploadModalOpen(true)}
              onFileClick={handleOpenFilePreview}
            />

            {/* 5. Chi phí & Khoán nhiệm vụ */}
            <CostBreakdownCard
              taskCost={activeNode.taskCost}
              bonusRate={activeNode.bonusRate}
              bonusAmount={activeNode.bonusAmount}
              totalEstimatedCost={activeNode.totalEstimatedCost}
              currency={activeNode.currency}
            />
          </section>

          {/* RIGHT COLUMN: Ô Nghiệp vụ & Danh mục Checklist đầu ra */}
          <section
            id="column-right-checklist"
            className="lg:col-span-7 flex flex-col min-h-full"
          >
            <ChecklistSection
              headerTitle={activeNode.checklistHeader}
              linkedCount={activeNode.checklistLinkedCount}
              items={activeNode.checklistItems}
              submissionWarning={activeNode.submissionWarning}
              submitButtonText={activeNode.submitButtonText}
              isUpdating={isUpdating}
              onAddChecklistClick={() => setIsAddChecklistOpen(true)}
              onResolveItemClick={handleOpenResolve}
              onFileClick={handleChecklistItemFileClick}
              onSubmitInspection={handleSubmitInspection}
            />
          </section>
        </div>
      </main>

      {/* MODALS */}

      {/* 1. Resolve Rejection Modal */}
      <ResolveRejectionModal
        isOpen={isResolveModalOpen}
        item={selectedResolveItem}
        nodeId={activeNodeId}
        onClose={() => {
          setIsResolveModalOpen(false);
          setSelectedResolveItem(null);
        }}
        onResolve={async (nodeId, itemId, payload) => {
          const res = await resolveRejection(nodeId, itemId, payload);
          if (res) {
            showToast('Đã khắc phục lỗi và cập nhật hồ sơ thành công!', 'success');
          }
          return res;
        }}
      />

      {/* 2. File Upload Modal */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        nodeId={activeNodeId}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={async (nodeId, file) => {
          const res = await addAttachment(nodeId, file);
          if (res) {
            showToast(`Đã thêm tệp "${file.name}" vào tủ hồ sơ!`, 'success');
          }
          return res;
        }}
      />

      {/* 3. Add Checklist Item Modal */}
      <AddChecklistModal
        isOpen={isAddChecklistOpen}
        nodeId={activeNodeId}
        onClose={() => setIsAddChecklistOpen(false)}
        onAdd={async (nodeId, itemData) => {
          const res = await addChecklistItem(nodeId, itemData);
          if (res) {
            showToast(`Đã bổ sung danh mục "${itemData.title}" vào checklist!`, 'success');
          }
          return res;
        }}
      />

      {/* 4. Document Preview & Upload Modal */}
      <DocumentPreviewModal
        isOpen={isPreviewModalOpen}
        file={previewFile}
        checklistItem={selectedChecklistItem}
        nodeId={activeNodeId}
        initialTab={previewInitialTab}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewFile(null);
          setSelectedChecklistItem(null);
        }}
        onUpdateChecklistFile={async (nodeId, itemId, fileInfo) => {
          const res = await updateChecklistItemFile(nodeId, itemId, fileInfo);
          if (res) {
            showToast(`Đã cập nhật tệp "${fileInfo.fileName}" cho danh mục "${selectedChecklistItem?.title || 'hồ sơ'}"!`, 'success');
          }
          return res;
        }}
      />

      {/* 5. Data Service & API Inspector Modal */}
      <ServiceInspectorModal
        isOpen={isInspectorOpen}
        moduleData={module}
        onClose={() => setIsInspectorOpen(false)}
        onRefresh={() => {
          reloadData();
          showToast('Đã làm mới dữ liệu từ Data Service!', 'info');
        }}
        onReset={() => {
          resetData();
          showToast('Đã khôi phục dữ liệu gốc từ JSON!', 'info');
        }}
      />
    </div>
  );
}
