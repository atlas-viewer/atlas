import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';

export const useControlledAnnotationList = (
  initialList: Array<{ x: number; y: number; width: number; height: number; id: any }> = []
) => {
  const [annotations, setAnnotations] =
    useState<Array<{ x: number; y: number; width: number; height: number; id: any }>>(initialList);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | undefined>();

  const addNewAnnotation = useCallback(() => {
    setIsEditing(true);
    setSelectedAnnotation(undefined);
  }, []);

  const editAnnotation = useCallback((id: string) => {
    setIsEditing(true);
    setSelectedAnnotation(id);
  }, []);

  const onUpdateAnnotation = (newAnno: any) => {
    setAnnotations((val) =>
      val.map((ann) => {
        if (ann.id === newAnno.id) {
          return newAnno;
        }
        return ann;
      })
    );
  };

  const onCreateNewAnnotation = useCallback((bounds: { x: number; y: number; width: number; height: number }) => {
    const id = nanoid();
    setAnnotations((a) => [...a, { id, ...bounds }]);
    setIsEditing(false);
    setSelectedAnnotation(undefined);
  }, []);

  const onDeselect = useCallback(() => {
    setIsEditing(false);
    setSelectedAnnotation(undefined);
  }, []);

  return {
    isEditing,
    onDeselect,
    selectedAnnotation,
    onCreateNewAnnotation,
    annotations,
    onUpdateAnnotation,
    setIsEditing,
    setSelectedAnnotation,
    editAnnotation,
    addNewAnnotation,
  };
};
