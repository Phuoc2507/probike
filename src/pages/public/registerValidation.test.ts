import { describe, expect, it } from 'vitest';
import { emptyForm, emptyMember, toRegisterInput, validateRegister, type RegisterForm } from './registerValidation';

const validForm = (): RegisterForm => ({
  ...emptyForm(),
  teamName: 'Đội Thăng Bằng',
  school: 'THPT Lê Quý Đôn',
  leader: { fullName: 'Nguyễn Văn An', email: 'An@Example.com', phone: '0912 345 678', password: 'abc12345', confirmPassword: 'abc12345' },
  members: [{ fullName: 'Trần Thị Bình', email: 'binh@example.com', phone: '', roleInTeam: 'Lập trình' }, emptyMember()],
  agree: true,
});

describe('validateRegister', () => {
  it('form hợp lệ thì không có lỗi', () => {
    expect(validateRegister(validForm())).toEqual({});
  });

  it('báo lỗi khi thiếu trường bắt buộc', () => {
    const e = validateRegister(emptyForm());
    expect(e.teamName).toBeTruthy();
    expect(e.school).toBeTruthy();
    expect(e['leader.email']).toBeTruthy();
    expect(e['leader.password']).toBeTruthy();
    expect(e.agree).toBeTruthy();
    // dòng thành viên trống không bị báo lỗi
    expect(e['members.0.fullName']).toBeUndefined();
  });

  it('kiểm tra email, SĐT, mật khẩu', () => {
    const f = validForm();
    f.leader.email = 'sai-email';
    f.leader.phone = '12345';
    f.leader.password = 'abcdefgh';
    f.leader.confirmPassword = 'khac';
    const e = validateRegister(f);
    expect(e['leader.email']).toMatch(/không hợp lệ/);
    expect(e['leader.phone']).toMatch(/không hợp lệ/);
    expect(e['leader.password']).toMatch(/chữ và số/);
    expect(e['leader.confirmPassword']).toMatch(/không khớp/);
  });

  it('phát hiện email trùng trong đội', () => {
    const f = validForm();
    f.members[0].email = 'an@example.com';
    expect(validateRegister(f)['members.0.email']).toMatch(/trùng/);
  });

  it('giới hạn 4 thành viên ngoài trưởng nhóm', () => {
    const f = validForm();
    f.members = Array.from({ length: 5 }, (_, i) => ({ ...emptyMember(), fullName: `TV ${i}`, email: `tv${i}@x.vn` }));
    expect(validateRegister(f).members).toBeTruthy();
  });
});

describe('toRegisterInput', () => {
  it('bỏ dòng trống và chuẩn hoá dữ liệu', () => {
    const input = toRegisterInput(validForm());
    expect(input.leader.email).toBe('an@example.com');
    expect(input.leader.phone).toBe('0912345678');
    expect(input.members).toHaveLength(1);
    expect(input.members[0].roleInTeam).toBe('Lập trình');
  });
});
