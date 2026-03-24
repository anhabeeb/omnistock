import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { 
  Paperclip, 
  FileText, 
  Image as ImageIcon, 
  Download, 
  Trash2,
  Loader2,
  Plus
} from 'lucide-react';
import { Attachment } from '../../types';

interface AttachmentManagerProps {
  entityType: 'grn' | 'wastage' | 'transfer' | 'stock_count' | 'request';
  entityId: string;
}

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({ entityType, entityId }) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAttachments();
  }, [entityId]);

  const fetchAttachments = async () => {
    try {
      const res = await fetch(`/api/attachments/${entityType}/${entityId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setAttachments(await res.json());
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);

    try {
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: formData
      , headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

      if (res.ok) {
        await fetchAttachments();
      } else {
        toast.error('Failed to upload attachment.');
      }
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast.error('Error uploading attachment.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAttachment = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;

    try {
      const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' , headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        setAttachments(attachments.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
    return <FileText className="w-5 h-5 text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) return <div className="text-sm text-gray-400">Loading attachments...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Evidence & Attachments
        </h3>
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs font-medium disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Upload File
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0">
                {getFileIcon(att.file_type)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={att.file_name}>
                  {att.file_name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(att.file_size)} • {new Date(att.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <a 
                href={att.file_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
              <button 
                onClick={() => deleteAttachment(att.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {attachments.length === 0 && !uploading && (
          <div className="col-span-2 py-8 text-center border-2 border-dashed border-gray-100 rounded-xl">
            <p className="text-sm text-gray-400">No attachments uploaded yet.</p>
          </div>
        )}
        {uploading && (
          <div className="flex items-center justify-center p-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg animate-pulse">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin mr-2" />
            <span className="text-xs text-gray-500">Uploading...</span>
          </div>
        )}
      </div>
    </div>
  );
};
