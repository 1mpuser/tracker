// Package opt — nullable-поля с отслеживанием присутствия ключа в JSON.
// Нужны, чтобы отличить «поле не передано» от «поле передано как null» —
// в NestJS DTO это различие есть (undefined vs null), а в Go встроенные
// указатели такого не дают.
package opt

import "encoding/json"

// String — необязательная строка: Set=true, если ключ был в теле запроса.
type String struct {
	Set   bool
	Value *string
}

func (s *String) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		s.Set = true
		s.Value = nil
		return nil
	}
	var v string
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	s.Set = true
	s.Value = &v
	return nil
}

// Bool — необязательный boolean.
type Bool struct {
	Set   bool
	Value *bool
}

func (b *Bool) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		b.Set = true
		b.Value = nil
		return nil
	}
	var v bool
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	b.Set = true
	b.Value = &v
	return nil
}

// Int — необязательный integer.
type Int struct {
	Set   bool
	Value *int
}

func (i *Int) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		i.Set = true
		i.Value = nil
		return nil
	}
	var v int
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	i.Set = true
	i.Value = &v
	return nil
}

// Int64 — необязательный 64-битный integer.
type Int64 struct {
	Set   bool
	Value *int64
}

func (i *Int64) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		i.Set = true
		i.Value = nil
		return nil
	}
	var v int64
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	i.Set = true
	i.Value = &v
	return nil
}
