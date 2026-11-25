import { useEffect, useState } from 'react';

/** Object URL of a chosen file, revoked when the file changes or the component goes away. */
export function useFilePreview(file: File | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}
