import { describe, it, expect } from 'vitest';

describe('Group Join Performance Optimization Logic', () => {
  it('correctly processes joined group data into map and arrays', () => {
    // 1. Mock Data: This is what `supabase.from('group_members').select('groups(id, keyword, header_image_url, image_url)')` returns
    const mockMemberships = [
      {
        groups: {
          id: 'group-1',
          keyword: 'runners',
          header_image_url: 'http://example.com/header1.jpg',
          image_url: 'http://example.com/icon1.jpg'
        }
      },
      {
        groups: {
          id: 'group-2',
          keyword: 'walkers',
          header_image_url: null,
          image_url: null
        }
      },
      // Edge case: missing group data (should be ignored or handled gracefully)
      {
        groups: null
      }
    ];

    // 2. Variables to populate (mimicking page.tsx scope)
    const groupKeywords: string[] = [];
    const groupMetadataMap = new Map<string, { id: string; header_image_url: string | null; image_url: string | null }>();
    const validGroupIds: string[] = [];

    // 3. The Logic Block (to be pasted into page.tsx)
    mockMemberships?.forEach((m) => {
      const g = m.groups;
      if (g && g.keyword) {
        groupKeywords.push(g.keyword);
        groupMetadataMap.set(g.keyword, g);
        if (g.id) validGroupIds.push(g.id);
      }
    });

    // 4. Verification
    expect(groupKeywords).toEqual(['runners', 'walkers']);
    expect(validGroupIds).toEqual(['group-1', 'group-2']);

    expect(groupMetadataMap.size).toBe(2);
    expect(groupMetadataMap.get('runners')).toEqual({
      id: 'group-1',
      keyword: 'runners',
      header_image_url: 'http://example.com/header1.jpg',
      image_url: 'http://example.com/icon1.jpg'
    });
    expect(groupMetadataMap.get('walkers')).toEqual({
      id: 'group-2',
      keyword: 'walkers',
      header_image_url: null,
      image_url: null
    });
  });
});
