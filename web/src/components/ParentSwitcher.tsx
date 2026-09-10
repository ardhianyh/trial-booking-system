import type { Parent } from '../api';

interface ParentSwitcherProps {
   parents: Parent[];
   activeParentId: string;
   onChange: (parentId: string) => void;
}

export const ParentSwitcher = ({ parents, activeParentId, onChange }: ParentSwitcherProps) => (
   <div className="field">
      <label htmlFor="acting-as">Acting as</label>
      <select
         id="acting-as"
         value={activeParentId}
         onChange={(event) => onChange(event.target.value)}
      >
         {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
               {parent.name}
            </option>
         ))}
      </select>
   </div>
);
