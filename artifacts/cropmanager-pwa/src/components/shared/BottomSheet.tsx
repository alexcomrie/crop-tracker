import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  position?: 'bottom' | 'center';
}

export function BottomSheet({ open, onClose, title, children, position = 'bottom' }: BottomSheetProps) {
  if (position === 'center') {
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="w-[min(92vw,480px)] max-h-[85dvh] overflow-y-auto rounded-2xl p-0">
          {title && (
            <DialogHeader className="px-5 pt-5 pb-3 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
              <DialogTitle className="text-center text-base">{title}</DialogTitle>
            </DialogHeader>
          )}
          <div className="px-5 pb-6">{children}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="fixed bottom-0 left-0 right-0 top-auto max-w-full rounded-t-2xl rounded-b-none p-0 max-h-[92dvh] overflow-y-auto translate-y-0 data-[state=closed]:translate-y-full transition-transform">
        {title && (
          <DialogHeader className="px-4 pt-4 pb-2 border-b sticky top-0 bg-white z-10">
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
