package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
)

// Config holds the API configuration from environment variables
type Config struct {
	BaseURL   string
	APIKey    string
	Workspace string
	ProjectID string
}

// Task represents a Plane task
type Task struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	State       string `json:"state"`
	Priority    string `json:"priority"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// APIResponse represents a generic API response
type APIResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	State       string `json:"state"`
	Priority    string `json:"priority"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// ErrorResponse represents an error message
type ErrorResponse struct {
	Error string `json:"error"`
}

// loadConfig loads configuration from environment variables
func loadConfig() Config {
	cfg := Config{
		BaseURL:   os.Getenv("PLANE_URL"),
		APIKey:    os.Getenv("PLANE_API_KEY"),
		Workspace: os.Getenv("PLANE_WORKSPACE"),
		ProjectID: os.Getenv("PLANE_PROJECT"),
	}

	if cfg.Workspace == "" {
		cfg.Workspace = "default"
	}
	if cfg.ProjectID == "" {
		cfg.ProjectID = "default"
	}

	return cfg
}

// printError outputs an error to stderr in JSON format
func printError(msg string) {
	errResp := ErrorResponse{Error: msg}
	jsonData, _ := json.Marshal(errResp)
	fmt.Fprintln(os.Stderr, string(jsonData))
	os.Exit(1)
}

// printJSON outputs data to stdout in JSON format
func printJSON(data interface{}) {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		printError(fmt.Sprintf("failed to marshal JSON: %v", err))
	}
	fmt.Println(string(jsonData))
}

// makeRequest performs an HTTP request to the Plane API
func makeRequest(cfg Config, method, endpoint string, body interface{}) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/api/v1/workspaces/%s/projects/%s/%s", cfg.BaseURL, cfg.Workspace, cfg.ProjectID, endpoint)

	var reqBody io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", cfg.APIKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	return result, nil
}

// handleCreateTask handles the task create command
func handleCreateTask(cfg Config, args []string) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	title := fs.String("title", "", "Task title (required)")
	priority := fs.String("priority", "medium", "Priority: low, medium, high, urgent")
	description := fs.String("description", "", "Task description")

	fs.Parse(args)

	if *title == "" {
		printError("--title is required")
	}

	validPriorities := map[string]bool{"low": true, "medium": true, "high": true, "urgent": true}
	if !validPriorities[*priority] {
		printError("invalid priority: must be low, medium, high, or urgent")
	}

	taskData := map[string]interface{}{
		"name":        *title,
		"priority":    *priority,
		"description": *description,
	}

	result, err := makeRequest(cfg, "POST", "issues/", taskData)
	if err != nil {
		printError(err.Error())
	}

	printJSON(result)
}

// handleListTasks handles the task list command
func handleListTasks(cfg Config, args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	state := fs.String("state", "", "Filter by state: todo, in_progress, done, backlog")

	fs.Parse(args)

	endpoint := "issues/"
	if *state != "" {
		validStates := map[string]bool{"todo": true, "in_progress": true, "done": true, "backlog": true}
		if !validStates[*state] {
			printError("invalid state: must be todo, in_progress, done, or backlog")
		}
		endpoint = fmt.Sprintf("issues/?state=%s", *state)
	}

	result, err := makeRequest(cfg, "GET", endpoint, nil)
	if err != nil {
		printError(err.Error())
	}

	printJSON(result)
}

// handleUpdateTask handles the task update command
func handleUpdateTask(cfg Config, args []string) {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	id := fs.String("id", "", "Task ID (required)")
	state := fs.String("state", "", "New state: todo, in_progress, done, backlog")
	title := fs.String("title", "", "New title")

	fs.Parse(args)

	if *id == "" {
		printError("--id is required")
	}

	if *state == "" && *title == "" {
		printError("at least one of --state or --title must be provided")
	}

	taskData := map[string]interface{}{}
	if *state != "" {
		validStates := map[string]bool{"todo": true, "in_progress": true, "done": true, "backlog": true}
		if !validStates[*state] {
			printError("invalid state: must be todo, in_progress, done, or backlog")
		}
		taskData["state"] = *state
	}
	if *title != "" {
		taskData["name"] = *title
	}

	endpoint := fmt.Sprintf("issues/%s/", *id)
	result, err := makeRequest(cfg, "PATCH", endpoint, taskData)
	if err != nil {
		printError(err.Error())
	}

	printJSON(result)
}

// handleCloseTask handles the task close command
func handleCloseTask(cfg Config, args []string) {
	fs := flag.NewFlagSet("close", flag.ExitOnError)
	id := fs.String("id", "", "Task ID (required)")

	fs.Parse(args)

	if *id == "" {
		printError("--id is required")
	}

	taskData := map[string]interface{}{
		"state": "done",
	}

	endpoint := fmt.Sprintf("issues/%s/", *id)
	result, err := makeRequest(cfg, "PATCH", endpoint, taskData)
	if err != nil {
		printError(err.Error())
	}

	printJSON(result)
}

func main() {
	cfg := loadConfig()

	if cfg.BaseURL == "" {
		printError("PLANE_URL environment variable is required")
	}
	if cfg.APIKey == "" {
		printError("PLANE_API_KEY environment variable is required")
	}

	if len(os.Args) < 2 {
		printError("usage: plane-cli <command> [args]\ncommands: task")
	}

	command := os.Args[1]

	switch command {
	case "task":
		if len(os.Args) < 3 {
			printError("usage: plane-cli task <subcommand> [args]\nsubcommands: create, list, update, close")
		}

		subcommand := os.Args[2]
		args := os.Args[3:]

		switch subcommand {
		case "create":
			handleCreateTask(cfg, args)
		case "list":
			handleListTasks(cfg, args)
		case "update":
			handleUpdateTask(cfg, args)
		case "close":
			handleCloseTask(cfg, args)
		default:
			printError(fmt.Sprintf("unknown task subcommand: %s\nvalid subcommands: create, list, update, close", subcommand))
		}
	default:
		printError(fmt.Sprintf("unknown command: %s\nvalid commands: task", command))
	}
}
