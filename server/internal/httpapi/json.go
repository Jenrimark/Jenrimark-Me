package httpapi

import (
	"encoding/json"
	"io"
)

func jsonEncoder(w io.Writer) func(v any) error {
	return func(v any) error {
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(v)
	}
}
