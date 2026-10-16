import { describe, expect, it } from 'vitest';
import { fromBase64, fromByteaHex, toBase64, toByteaHex } from './bytes';
import { formatVnd, friendlyError, groupBudget, parseVietNumber, toCsv, validateRegistration } from './format';
import type { RegisterTeamInput } from './api';

describe('bytes', () => {
  it('bytea hex khứ hồi', () => {
    const b = new Uint8Array([0, 15, 16, 255]);
    expect(toByteaHex(b)).toBe('\\x000f10ff');
    expect(Array.from(fromByteaHex(toByteaHex(b))!)).toEqual([0, 15, 16, 255]);
    expect(fromByteaHex(null)).toBeNull();
    expect(fromByteaHex('\\xzz')).toBeNull();
  });
  it('base64 khứ hồi (kể cả mảng lớn)', () => {
    const b = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
  });
});

describe('format', () => {
  it('formatVnd / parseVietNumber', () => {
    expect(formatVnd(1500000)).toBe('1.500.000 đ');
    expect(parseVietNumber('1.500.000')).toBe(1500000);
    expect(parseVietNumber('2,5')).toBe(2.5);
    expect(parseVietNumber('1500000 đ')).toBe(1500000);
    expect(parseVietNumber('abc')).toBe(0);
    expect(parseVietNumber('')).toBe(0);
  });

  it('groupBudget nhóm theo hạng mục và cộng tổng', () => {
    const { groups, total } = groupBudget([
      { category: 'Giải thưởng', qty: 1, unitPrice: 5_000_000, sort: 10 },
      { category: 'Sa hình', qty: 2, unitPrice: 100_000, sort: 5 },
      { category: 'Giải thưởng', qty: 3, unitPrice: 500_000, sort: 20 },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Sa hình', 'Giải thưởng']);
    expect(groups[1].total).toBe(6_500_000);
    expect(total).toBe(6_700_000);
  });

  it('toCsv thoát dấu phẩy, ngoặc kép, có BOM', () => {
    const csv = toCsv([['a,b', 'c"d', 1], ['Trường', null, '']]);
    expect(csv).toBe('﻿"a,b","c""d",1\r\nTrường,,');
  });

  it('friendlyError dịch lỗi phổ biến', () => {
    expect(friendlyError('Invalid login credentials')).toBe('Email hoặc mật khẩu không đúng');
    expect(friendlyError('Tên đội đã được dùng')).toBe('Tên đội đã được dùng');
  });
});

describe('validateRegistration', () => {
  const base: RegisterTeamInput = {
    teamName: 'Đội Gió',
    school: 'THPT A',
    leader: { fullName: 'An', email: 'an@x.vn', phone: '09', password: '123456' },
    members: [{ fullName: 'Bình', email: 'binh@x.vn', phone: '', roleInTeam: 'Code' }],
  };
  it('hợp lệ', () => expect(validateRegistration(base)).toBeNull());
  it('bắt email trùng (không phân biệt hoa thường)', () => {
    expect(validateRegistration({ ...base, members: [{ ...base.members[0], email: 'AN@x.vn' }] })).toMatch(/trùng/);
  });
  it('tối đa 4 thành viên ngoài trưởng nhóm', () => {
    expect(validateRegistration({ ...base, members: Array(5).fill(base.members[0]) })).toMatch(/tối đa/);
  });
  it('mật khẩu ngắn', () => {
    expect(validateRegistration({ ...base, leader: { ...base.leader, password: '1' } })).toMatch(/Mật khẩu/);
  });
});
