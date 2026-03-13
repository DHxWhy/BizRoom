import React, { useState } from "react";

const ROLE_PRESETS = ["마케팅", "개발", "디자인", "영업", "기획", "재무", "법무"];

interface RoleSelectorProps {
  onSelect: (role: string, name: string) => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ onSelect }) => {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [customRole, setCustomRole] = useState("");
  const [name, setName] = useState("");

  const effectiveRole = selectedRole === "custom" ? customRole : selectedRole;

  const handleSubmit = () => {
    if (effectiveRole && name) {
      onSelect(effectiveRole, name);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-gray-900 rounded-xl border border-gray-700 max-w-md">
      <h3 className="text-lg font-bold text-white">팀원 참여</h3>

      <input
        type="text"
        placeholder="이름 (예: 김과장)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
      />

      <div className="flex flex-wrap gap-2">
        {ROLE_PRESETS.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`px-3 py-1.5 rounded text-sm border ${
              selectedRole === role
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
            }`}
          >
            {role}
          </button>
        ))}
        <button
          onClick={() => setSelectedRole("custom")}
          className={`px-3 py-1.5 rounded text-sm border ${
            selectedRole === "custom"
              ? "border-purple-500 bg-purple-500/20 text-purple-400"
              : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
          }`}
        >
          직접 입력
        </button>
      </div>

      {selectedRole === "custom" && (
        <input
          type="text"
          placeholder="직무명 입력"
          value={customRole}
          onChange={(e) => setCustomRole(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={!effectiveRole || !name}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-white text-sm font-medium"
      >
        회의 참여
      </button>
    </div>
  );
};
