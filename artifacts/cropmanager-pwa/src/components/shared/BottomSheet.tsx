import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="fixed bottom-0 left-0 right-0 top-auto max-w-full rounded-t-2xl rounded-b-none p-0 max-h-[92vh] overflow-y-auto translate-y-0 data-[state=closed]:translate-y-full transition-transform">
        {title && (
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <DialogTitle className="text-center">{title}</DialogTitle>
          </DialogHeader>
        )}
        {!title && <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1" />}
        <div className="px-4 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
